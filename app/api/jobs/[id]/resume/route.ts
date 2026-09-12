import { NextResponse } from "next/server";
import { z } from "zod";
import { approvedEvidenceIds, keepGroundedIds } from "@/lib/ai/grounding";
import { createSafetyIdentifier, generateStructuredJson } from "@/lib/ai/provider";
import { aiQuotaResponse, checkAiQuota } from "@/lib/ai/quota";
import { getAuthenticatedUser } from "@/lib/auth";
import { evidenceIdsIn, renderResumeText, resumeContentOf, type ResumeBullet, type ResumeContent, type ResumeRole } from "@/lib/resume/content";
import { DEFAULT_TEMPLATE } from "@/lib/resume/templates";
import { tailoringGain } from "@/lib/resume/ats";
import { RESUME_WRITING_RULES } from "@/lib/resume/writing";
import type { RuleAnalysis } from "@/lib/types";
import { saveResumeDraft } from "@/lib/resume/save";

// Same reasoning as the deep-analysis route: the declared budget has to cover
// the 90s the provider adapter is allowed to wait, or the host kills the
// handler before its own timeout and error handling can run.
export const runtime = "nodejs";
export const maxDuration = 120;

const bulletSchema = z.object({
  text: z.string().min(5),
  evidenceIds: z.array(z.string()).min(1),
});

const outputSchema = z.object({
  versionName: z.string().min(3),
  /*
   * The role being aimed at, not a headline. The name comes from the person's
   * own profile — asking a model for it invites it to write one, and a résumé
   * with an invented name on it is the worst document this product could
   * produce.
   */
  targetRole: z.string().min(2),
  professionalSummary: z.string().min(20),
  /*
   * Bullets keyed to a real job. This is what makes a template possible: a
   * bullet that knows which employer and which dates it belongs under can be
   * laid out as an experience entry rather than as an item in a list.
   */
  experience: z.array(z.object({
    roleId: z.string().min(1),
    bullets: z.array(bulletSchema).min(1),
  })).default([]),
  /* Anything that is not dated employment — projects, certifications. */
  sections: z.array(z.object({
    heading: z.string().min(2),
    bullets: z.array(bulletSchema).min(1),
  })).default([]),
  changeLog: z.array(z.object({
    type: z.enum(["emphasised", "reworded", "omitted", "moved"]),
    description: z.string().min(5),
    evidenceIds: z.array(z.string()),
  })),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["versionName", "targetRole", "professionalSummary", "experience", "sections", "changeLog"],
  properties: {
    versionName: { type: "string" },
    targetRole: { type: "string" },
    professionalSummary: { type: "string" },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["roleId", "bullets"],
        properties: {
          roleId: { type: "string" },
          bullets: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "evidenceIds"],
              properties: {
                text: { type: "string" },
                evidenceIds: { type: "array", minItems: 1, items: { type: "string" } },
              },
            },
          },
        },
      },
    },
    sections: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["heading", "bullets"],
        properties: {
          heading: { type: "string" },
          bullets: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "evidenceIds"],
              properties: {
                text: { type: "string" },
                evidenceIds: { type: "array", minItems: 1, items: { type: "string" } },
              },
            },
          },
        },
      },
    },
    changeLog: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "description", "evidenceIds"],
        properties: {
          type: { type: "string", enum: ["emphasised", "reworded", "omitted", "moved"] },
          description: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Opportunity not found." }, { status: 404 });

  const [jobResult, requirementsResult, evidenceResult, rolesResult, profileResult, masterResult] = await Promise.all([
    supabase.from("jobs").select("*").eq("id", id).eq("user_id", user.id).maybeSingle(),
    supabase.from("job_requirements").select("*").eq("job_id", id),
    supabase
      .from("evidence_items")
      .select("id,claim,context,metrics,domains,source_name,source_locator")
      .eq("user_id", user.id)
      .eq("approval_status", "approved")
      .eq("safe_for_resume", true),
    /*
     * The employment history, which the résumé never saw.
     *
     * It has been sitting in career_roles since the import wrote it there —
     * employer, title, location and dates, for every job. The draft was built
     * from evidence alone, so every bullet arrived detached from the job it
     * happened in, and the document had nowhere to put an employer or a date.
     * That, and not the stylesheet, is why six templates could only ever be
     * six typefaces.
     */
    supabase
      .from("career_roles")
      .select("id,employer,title,location,start_date,end_date,is_current")
      .eq("user_id", user.id)
      .order("start_date", { ascending: false }),
    supabase.from("profiles").select("full_name,location,phone,linkedin_url,website_url").eq("id", user.id).maybeSingle(),
    /*
     * The master résumé, asked for separately and allowed to fail.
     *
     * Tailoring used to rebuild the document from raw evidence every time, so
     * the master was a dead end: somebody spent an afternoon getting their own
     * wording right and the first tailored draft threw all of it away and
     * started again from the database. The two were never a flow, they were
     * two buttons that happened to read the same table.
     *
     * It is its own query rather than two more columns on the one above,
     * because PostgREST fails a whole select for one unknown column and these
     * columns arrive by a migration run by hand in the SQL editor. Folded in,
     * a deployment running ahead of its schema would lose the name and the
     * contact block too — it would stop being able to draft a résumé at all,
     * to add a feature it does not have yet. Here the worst case is no master,
     * which is how this route worked for its whole life.
     */
    supabase.from("profiles").select("master_resume,master_resume_text").eq("id", user.id).maybeSingle(),
  ]);

  const error = jobResult.error ?? requirementsResult.error ?? evidenceResult.error;
  if (error) {
    console.error("Unable to prepare résumé inputs", error);
    return NextResponse.json({ error: "Sartho could not prepare the approved résumé evidence." }, { status: 500 });
  }
  if (!jobResult.data) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (jobResult.data.deep_analysis_status !== "complete") {
    return NextResponse.json({ error: "Complete deep analysis before drafting a tailored résumé." }, { status: 400 });
  }
  if (!evidenceResult.data?.length) {
    return NextResponse.json({ error: "No approved résumé-safe evidence is available." }, { status: 400 });
  }

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

  /*
   * The person's own master résumé, if they have built one.
   *
   * `resumeContentOf` is the same reader the studio uses, so a master saved
   * before the structured column existed is still recovered from its text
   * rather than treated as absent. An error here — the missing-column case —
   * is silently no master.
   */
  const master = masterResult.error
    ? null
    : resumeContentOf(masterResult.data?.master_resume, masterResult.data?.master_resume_text ?? null);
  const masterText = master ? renderResumeText(master) : "";

  const quota = await checkAiQuota(supabase, "resume_draft");
  if (!quota.allowed) return aiQuotaResponse(quota);

  try {
    const raw = await generateStructuredJson({
      workload: "quality",
      safetyIdentifier: createSafetyIdentifier(user.id),
      schemaName: "sartho_tailored_resume",
      schema: jsonSchema,
      /*
       * The house writing standard sits in the middle of these, not as a
       * flourish but because this is the document somebody sends. It used to
       * be told only not to invent — and was then scored by an ATS panel
       * marking it down for weak openers and passive voice it had never been
       * asked to avoid. The instruction and the score now read one source.
       */
      system: [
        "You draft a review-only résumé version using only the approved evidence supplied.",
        "Never create or infer an employer, date, skill, metric, certification, responsibility or outcome.",
        "Every bullet must cite at least one supplied evidence ID that directly supports the wording.",
        "Reorder, emphasise or carefully reword evidence to align with the job requirements, but preserve factual meaning.",
        "Do not include contact details, education or certifications unless they appear in the supplied evidence.",
        "Place each bullet under the employment role it happened in, citing that role's id in experience[].roleId.",
        "Use only the role ids supplied. Never invent a role, an employer, a job title or a date — the employment history is given to you and is not yours to add to.",
        "Put a bullet in sections[] only when it genuinely belongs to no supplied role, such as a project or a certification.",
        RESUME_WRITING_RULES,
        "Aligning to the advert means choosing which true things to lead with and naming them in the advert's own vocabulary where the evidence already means the same thing. It never means claiming something the evidence does not carry.",
        "If a master résumé the candidate wrote is supplied, it is your starting document, not a reference. Keep its wording wherever that wording already serves this advert, and change a line only where the advert gives you a reason to. Their phrasing is theirs; a rewrite that says the same thing in different words costs them their voice and gains nothing.",
        "Say in the change log what you changed and why the advert asked for it. A line you left alone needs no entry.",
        "The change log must explain every material emphasis, rewording, omission or movement.",
      ].join(" "),
      prompt: JSON.stringify({
        job: {
          title: jobResult.data.title,
          employer: jobResult.data.employer,
          description: jobResult.data.raw_description,
        },
        requirementMapping: requirementsResult.data,
        /*
         * Omitted entirely when there is none, rather than sent as null. A key
         * whose value is "there is nothing here" is still an instruction to
         * think about it.
         */
        ...(master ? { masterResumeTheCandidateWrote: master } : {}),
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

    const parsed = outputSchema.parse(raw);
    const approvedIds = approvedEvidenceIds(evidenceResult.data);

    /*
     * A bullet whose every citation was discarded is dropped outright rather
     * than downgraded. Unlike a requirement assessment, a résumé line has no
     * honest weaker form — it either has a receipt or it does not belong on
     * the page.
     */
    const groundBullets = (
      raw: Array<{ text: string; evidenceIds: string[] }>,
      prefix: string,
    ): ResumeBullet[] =>
      raw
        .map((bullet) => ({ text: bullet.text.trim(), evidenceIds: keepGroundedIds(bullet.evidenceIds, approvedIds) }))
        .filter((bullet) => bullet.text && bullet.evidenceIds.length)
        .map((bullet, index) => ({ ...bullet, id: `${prefix}b${index}`, edited: false }));

    const sections = parsed.sections
      .map((section, sectionIndex) => ({
        id: `s${sectionIndex}`,
        heading: section.heading.trim(),
        bullets: groundBullets(section.bullets, `s${sectionIndex}`),
      }))
      .filter((section) => section.bullets.length);

    /*
     * Bullets attached to the employment history they came from.
     *
     * Driven by careerRoles, not by what the model returned, so the employer,
     * the title and the dates on the page are the ones the person's own record
     * holds. The model chooses which bullets belong to which job; it never gets
     * to say who somebody worked for or when.
     *
     * A roleId that matches nothing is not silently dropped — the bullets are
     * grounded and verifiable, so they go into a section rather than being
     * thrown away because the model mistyped an id.
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

    const known = new Set(careerRoles.map((role) => role.id));
    const orphaned = parsed.experience
      .filter((entry) => !known.has(entry.roleId))
      .flatMap((entry) => entry.bullets);
    if (orphaned.length) {
      const bullets = groundBullets(orphaned, `s${sections.length}`);
      if (bullets.length) sections.push({ id: `s${sections.length}`, heading: "Experience", bullets });
    }

    if (!roles.length && !sections.length) {
      throw new Error("The draft did not contain any verifiable résumé bullets.");
    }

    const changeLog = parsed.changeLog.map((change) => ({
      type: change.type,
      description: change.description.trim(),
      evidenceIds: keepGroundedIds(change.evidenceIds, approvedIds),
    }));

    /*
     * The document is what gets saved, and the text is derived from it.
     *
     * It used to be the other way round — the structure was joined into a
     * string here and discarded, taking the per-bullet evidence ids with it.
     * That one step is why the draft could only be shown in a monospaced
     * <pre>, why it could not be edited, and why a template was impossible.
     *
     * renderResumeText is the single encoder, shared with the editor, so the
     * text column and the structure beside it cannot describe different
     * documents.
     */
    /*
     * The name and the contact block come from the person's own record and
     * their sign-in address, never from the model. Education is left empty on
     * purpose: nothing in the database holds it yet, and a blank the person
     * fills in is honest where an invented degree would be a catastrophe.
     */
    const content: ResumeContent = {
      template: DEFAULT_TEMPLATE,
      name: (profileResult.data?.full_name ?? "").trim(),
      targetRole: parsed.targetRole.trim(),
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
    const evidenceIds = evidenceIdsIn(content);

    const { applicationId, error: saveError } = await saveResumeDraft(supabase, {
      jobId: id,
      versionName: parsed.versionName.trim(),
      draft,
      changeLog,
      evidenceIds,
      content,
    });
    if (saveError) throw saveError;

    /*
     * What tailoring was worth, against the same advert.
     *
     * The studio has always scored the draft in front of it, which answers
     * "how does this read" and never "did the button do anything". Both sides
     * are scored here against one analysis, so the difference is a like-for-
     * like comparison rather than two numbers from different questions.
     *
     * `before` is null when there is no master to compare against. That is a
     * different thing from a score of zero and is said as one — an absent
     * comparison must never render as a drop from nothing.
     */
    const signal = tailoringGain(masterText, draft, (jobResult.data.rule_analysis ?? null) as RuleAnalysis | null);

    return NextResponse.json({
      applicationId,
      versionName: parsed.versionName.trim(),
      draft,
      changeLog,
      evidenceIds,
      /* Whether this draft started from the person's own document or from the evidence. */
      tailoredFromMaster: Boolean(masterText),
      signal,
    });
  } catch (caught) {
    console.error("Résumé drafting failed", caught);
    const message = caught instanceof Error && caught.message.startsWith("Sartho")
      ? caught.message
      : "Sartho could not create this résumé draft. Your existing evidence and application data are unchanged.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
