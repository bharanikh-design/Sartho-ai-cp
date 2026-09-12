import { NextResponse } from "next/server";
import { z } from "zod";
import { approvedEvidenceIds, keepGroundedIds } from "@/lib/ai/grounding";
import { createSafetyIdentifier, generateStructuredJson } from "@/lib/ai/provider";
import { aiQuotaResponse, checkAiQuota } from "@/lib/ai/quota";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  evidenceIdsIn,
  parseResumeContent,
  renderResumeText,
  type ResumeBullet,
  type ResumeContent,
  type ResumeRole,
  type ResumeSection,
} from "@/lib/resume/content";
import { MASTER_RESUME_RULES, MASTER_RESUME_SCHEMA, masterResumeOutput } from "@/lib/resume/master";
import { REPAIR_RULES, REPAIR_SCHEMA, acceptRepairs, linesNeedingRepair, remainingFaults } from "@/lib/resume/polish";
import { DEFAULT_TEMPLATE } from "@/lib/resume/templates";

/*
 * The master résumé: the one that is not about any particular advert.
 *
 * This route is what "Build Master Résumé" has been calling since the button
 * was added. It did not exist, so the button answered 404 — which is why the
 * résumé somebody uploaded appeared to have gone missing. It had not gone
 * missing: the uploaded file is deleted on purpose the moment its text is read,
 * and what survives is the approved evidence. This turns that evidence back
 * into a document.
 *
 * It is the tailored draft's sibling and deliberately shares its rules: only
 * approved evidence, every bullet citing the evidence that supports it, the
 * employment history taken from the person's own record rather than from the
 * model. What it drops is the advert — there is no job description to align to,
 * no requirement mapping, and no change log explaining what was emphasised for
 * whom, because nothing was.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

/*
 * The columns this writes to arrive by a migration run by hand in the SQL
 * editor, so there is always a window where the deployed code and the schema
 * disagree. PostgREST answers PGRST204 for a column it cannot find; saying so
 * plainly beats a 500 that reads as a provider fault, which is the failure this
 * whole route exists downstream of.
 */
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST204") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("master_resume") && (message.includes("does not exist") || message.includes("could not find"));
}

export async function POST() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [evidenceResult, rolesResult, profileResult] = await Promise.all([
    supabase
      .from("evidence_items")
      .select("id, claim, context, metrics, domains, period_label, career_role_id")
      .eq("user_id", user.id)
      .eq("approval_status", "approved")
      .eq("safe_for_resume", true),
    supabase
      .from("career_roles")
      .select("id, employer, title, location, start_date, end_date, is_current")
      .eq("user_id", user.id)
      .order("start_date", { ascending: false }),
    supabase
      .from("profiles")
      .select("full_name, phone, location, linkedin_url, website_url")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (evidenceResult.error) {
    return NextResponse.json({ error: "Sartho could not read your approved evidence." }, { status: 500 });
  }
  if (!evidenceResult.data?.length) {
    return NextResponse.json(
      { error: "There is no approved résumé-safe evidence to build from yet. Approve your career facts in Career Truth first." },
      { status: 400 },
    );
  }

  const quota = await checkAiQuota(supabase, "resume_draft");
  if (!quota.allowed) return aiQuotaResponse(quota);

  type CareerRole = {
    id: string;
    employer: string | null;
    title: string | null;
    location: string | null;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean | null;
  };
  const careerRoles: CareerRole[] = (rolesResult.data ?? []) as CareerRole[];

  try {
    const raw = await generateStructuredJson({
      workload: "quality",
      safetyIdentifier: createSafetyIdentifier(user.id),
      schemaName: "sartho_master_resume",
      schema: MASTER_RESUME_SCHEMA,
      system: MASTER_RESUME_RULES,
      prompt: JSON.stringify({
        approvedResumeEvidence: evidenceResult.data,
        employmentHistory: careerRoles.map((role) => ({
          roleId: role.id,
          title: role.title,
          employer: role.employer,
          location: role.location,
          start: role.start_date,
          end: role.end_date,
          current: role.is_current,
        })),
      }),
    });

    const parsed = masterResumeOutput.parse(raw);
    const approvedIds = approvedEvidenceIds(evidenceResult.data);

    /*
     * A bullet whose every citation was discarded is dropped, not softened.
     * A résumé line has no honest weaker form: it either has a receipt or it
     * does not belong on the page.
     */
    const groundBullets = (
      bullets: Array<{ text: string; evidenceIds: string[] }>,
      prefix: string,
    ): ResumeBullet[] =>
      bullets
        .map((bullet) => ({ text: bullet.text.trim(), evidenceIds: keepGroundedIds(bullet.evidenceIds, approvedIds) }))
        .filter((bullet) => bullet.text.length > 0 && bullet.evidenceIds.length > 0)
        /* `edited` is false on every line here: nobody has touched it yet. */
        .map((bullet, index) => ({ ...bullet, id: `${prefix}b${index}`, edited: false }));

    /*
     * Driven by the person's own employment record, not by what the model
     * returned. The model chooses which bullets belong to which job; it never
     * gets to say who somebody worked for or when.
     */
    const drafted = new Map(parsed.experience.map((entry) => [entry.roleId, entry.bullets]));
    const roles: ResumeRole[] = careerRoles
      .map((role, roleIndex) => ({
        id: role.id,
        title: (role.title ?? "").trim(),
        employer: (role.employer ?? "").trim(),
        location: (role.location ?? "").trim(),
        start: (role.start_date ?? "").trim(),
        end: (role.end_date ?? "").trim(),
        current: role.is_current === true,
        bullets: groundBullets(drafted.get(role.id) ?? [], `r${roleIndex}`),
      }))
      .filter((role) => role.bullets.length);

    /*
     * A roleId matching nothing is not thrown away — the bullets are grounded
     * and verifiable, so they keep their place under a heading rather than
     * being lost because the model mistyped an id.
     */
    const known = new Set(careerRoles.map((role) => role.id));
    const sections: ResumeSection[] = [];
    const orphaned = parsed.experience.filter((entry) => !known.has(entry.roleId)).flatMap((entry) => entry.bullets);
    if (orphaned.length) {
      const bullets = groundBullets(orphaned, "s0");
      if (bullets.length) sections.push({ id: "s0", heading: "Experience", bullets });
    }

    /*
     * The draft, checked against the rules that produced it, and repaired.
     *
     * Until now the writing standard was stated in the prompt above and
     * verified nowhere: the model wrote, the draft was saved, and the panel
     * afterwards told the person which lines broke rules the model had already
     * been handed. A rule a machine can check is a rule the machine should fix
     * before anybody reads it.
     *
     * Best effort. A failed repair pass leaves the first draft exactly as it
     * was — this improves a résumé, it is not allowed to cost one.
     */
    const flat = [...roles.flatMap((role) => role.bullets), ...sections.flatMap((section) => section.bullets)]
      .map((bullet) => ({ id: bullet.id, text: bullet.text }));
    const faulty = linesNeedingRepair(flat);

    let repaired = 0;
    if (faulty.length) {
      try {
        const fixes = await generateStructuredJson({
          workload: "fast",
          safetyIdentifier: createSafetyIdentifier(user.id),
          schemaName: "sartho_resume_repair",
          schema: REPAIR_SCHEMA,
          system: REPAIR_RULES,
          prompt: JSON.stringify({ linesToRepair: faulty }),
        });

        const returned = z
          .object({ lines: z.array(z.object({ id: z.string(), text: z.string() })) })
          .parse(fixes).lines;

        const outcome = acceptRepairs(flat, returned);
        repaired = outcome.accepted;

        /* Accepted repairs go back onto the bullets they came from. */
        const byId = new Map(outcome.lines.map((entry) => [entry.id, entry.text]));
        for (const role of roles) {
          for (const bullet of role.bullets) bullet.text = byId.get(bullet.id) ?? bullet.text;
        }
        for (const section of sections) {
          for (const bullet of section.bullets) bullet.text = byId.get(bullet.id) ?? bullet.text;
        }
      } catch (caught) {
        console.warn("The résumé repair pass failed; keeping the first draft", caught);
      }
    }

    /*
     * Read back off the bullets rather than off `flat`, which holds copies
     * taken before the repair ran — reporting what is left from those would
     * describe the draft that no longer exists.
     */
    const finalLines = () =>
      [...roles.flatMap((role) => role.bullets), ...sections.flatMap((section) => section.bullets)]
        .map((bullet) => ({ id: bullet.id, text: bullet.text }));

    if (!roles.length && !sections.length) {
      return NextResponse.json(
        { error: "Sartho could not build a master résumé whose every line traces back to approved evidence." },
        { status: 422 },
      );
    }

    /*
     * The name and contact block come from the person's own record and their
     * sign-in address, never from the model. Education stays empty on purpose:
     * nothing in the database holds it, and a blank somebody fills in is honest
     * where an invented degree would be a catastrophe.
     */
    const content: ResumeContent = {
      template: DEFAULT_TEMPLATE,
      name: (profileResult.data?.full_name ?? "").trim(),
      targetRole: parsed.headline.trim(),
      contact: {
        email: user.email ?? "",
        phone: (profileResult.data?.phone ?? "").trim(),
        location: (profileResult.data?.location ?? "").trim(),
        linkedin: (profileResult.data?.linkedin_url ?? "").trim(),
        website: (profileResult.data?.website_url ?? "").trim(),
      },
      summary: parsed.professionalSummary.trim(),
      roles,
      sections,
      skills: [],
      education: [],
    };

    const draft = renderResumeText(content);
    const { error: saveError } = await supabase
      .from("profiles")
      .update({
        master_resume: content,
        master_resume_text: draft,
        master_resume_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (isMissingColumn(saveError)) {
      console.error("Master résumé columns are missing", saveError);
      return NextResponse.json(
        { error: "Sartho built the master résumé but has nowhere to keep it: this deployment is missing the master_resume columns. The administrator needs to run the 20260912080000_master_resume migration." },
        { status: 503 },
      );
    }
    if (saveError) throw saveError;

    return NextResponse.json({
      headline: parsed.headline.trim(),
      draft,
      content,
      evidenceIds: evidenceIdsIn(content),
      bulletCount: roles.reduce((total, role) => total + role.bullets.length, 0),
      /*
       * What the second pass did, so the work is visible rather than magic.
       * `remaining` is usually a line where the checker is wrong — a bullet
       * that needs the passive voice because the actor is not the person — and
       * those belong to the reader, not to another round of rewriting.
       */
      writing: { flagged: faulty.length, repaired, remaining: remainingFaults(finalLines()).length },
    });
  } catch (caught) {
    console.error("Master résumé drafting failed", caught);
    const message = caught instanceof Error && caught.message.startsWith("Sartho")
      ? caught.message
      : "Sartho could not build your master résumé. Your evidence is unchanged.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/*
 * Saving an edited master résumé.
 *
 * The master is a résumé like any other: it opens in the same editor as every
 * tailored draft, so it has to save like one. Without this it was the only
 * document in the product you could open, change, and not keep — which is what
 * made it feel like a read-only artefact rather than the source document it is.
 *
 * No AI, no evidence check, no grounding pass. This is a person editing their
 * own words, and the grounding rules exist to stop a model inventing, not to
 * stop somebody writing their own sentence.
 */
export async function PUT(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as { content?: unknown } | null;
  const content = parseResumeContent(body?.content);
  if (!content) {
    return NextResponse.json({ error: "Sartho could not read that résumé." }, { status: 400 });
  }

  const { error: saveError } = await supabase
    .from("profiles")
    .update({
      master_resume: content,
      master_resume_text: renderResumeText(content),
      master_resume_updated_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  if (isMissingColumn(saveError)) {
    return NextResponse.json(
      { error: "This deployment is missing the master_resume columns. The administrator needs to run the 20260912080000_master_resume migration." },
      { status: 503 },
    );
  }
  if (saveError) {
    console.error("Saving the master résumé failed", saveError);
    return NextResponse.json({ error: "Sartho could not save your master résumé." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
