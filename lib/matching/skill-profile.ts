import type { CareerRoleRecord, Confidence, EvidenceRecord } from "@/lib/types";
import { capabilitiesIn, capabilityForLabel } from "@/lib/matching/skill-vocabulary";

/*
 * The skill set, built from approved evidence.
 *
 * Derived rather than generated. Every skill here exists because approved
 * evidence says so, and every one can name the claims it rests on — which is
 * the difference between a profile and a list of words someone typed about
 * themselves. No model runs, so this costs nothing, returns instantly, and
 * cannot invent a skill that is not in the evidence base.
 *
 * Two sources feed it, and until recently only the first did:
 *
 *   1. The domain tags on each claim — six or so broad words like "Consulting".
 *   2. The claim sentences themselves, read through the shared vocabulary.
 *
 * Reading only the tags was why matching failed. "Constructed the RTM to track
 * business requirements" is the evidence that someone can do business analysis,
 * and that sentence was never looked at — only the word "Consulting" filed
 * beside it. Both are now resolved to the same canonical capability, so a
 * résumé and a job advert are finally described in one language.
 */

export type SkillStrength = "core" | "strong" | "supporting" | "emerging";

export type SkillSummary = {
  /** The person's own wording, kept so the UI never renames their experience. */
  name: string;
  /** The shared capability this resolves to. Matching compares on this. */
  capability: string;
  /** Approved evidence items mentioning this skill. */
  evidenceCount: number;
  /** Those items' ids, so a claim can always be traced back. */
  evidenceIds: string[];
  /** Distinct employers the skill appears at — breadth, not just volume. */
  employerCount: number;
  /** Whole years between the earliest and latest role carrying it. */
  years: number | null;
  /** Whether it appears in a role with no end date. */
  current: boolean;
  strength: SkillStrength;
  /** The single strongest claim behind it, for showing the receipt. */
  topClaim: string | null;
};

export type SkillProfile = {
  skills: SkillSummary[];
  totalApproved: number;
  /** Approved evidence carrying no domains at all — invisible to matching. */
  unclassified: number;
};

const confidenceWeight: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

function displayName(values: string[]) {
  // Keeps the most common spelling rather than whichever arrived first.
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

function comparisonForm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function yearsBetween(earliest: string | null, latest: string | null) {
  if (!earliest) return null;
  const start = new Date(earliest);
  const end = latest ? new Date(latest) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const years = (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return years < 0 ? null : Math.round(years);
}

/*
 * Strength is deliberately about corroboration, not self-assessment. A skill
 * shown at several employers over years is a different claim from one bullet
 * on one job, and a profile that cannot tell them apart is no use for deciding
 * whether to apply for something.
 */
function gradeStrength(evidenceCount: number, employerCount: number, weight: number): SkillStrength {
  if (evidenceCount >= 4 && employerCount >= 2) return "core";
  if (evidenceCount >= 3 || (evidenceCount >= 2 && employerCount >= 2)) return "strong";
  if (evidenceCount >= 2 || weight >= 3) return "supporting";
  return "emerging";
}

export function buildSkillProfile(
  evidence: EvidenceRecord[],
  roles: CareerRoleRecord[] = [],
): SkillProfile {
  const approved = evidence.filter((item) => item.approval_status === "approved");
  const roleById = new Map(roles.map((role) => [role.id, role]));

  type Bucket = {
    capability: string;
    /** Labels the person actually wrote. The display name comes from these. */
    names: string[];
    evidenceIds: string[];
    employers: Set<string>;
    weight: number;
    earliest: string | null;
    latest: string | null;
    current: boolean;
    best: { claim: string; weight: number } | null;
  };

  const buckets = new Map<string, Bucket>();
  let unclassified = 0;

  for (const item of approved) {
    /*
     * Tags and prose together. A claim with no tags is no longer invisible —
     * its own words can still name a capability — so "unclassified" now means
     * an item from which nothing recognisable could be read at all.
     */
    /*
     * Each contribution carries both the capability it resolves to and the
     * words it came from. Buckets key on the capability, so "ServiceNow" and
     * "ITSM" meet; the display name stays whatever the person wrote, so the
     * screen never renames their experience back at them.
     */
    const contributions = [
      ...item.domains.map((domain) => ({ capability: capabilityForLabel(domain), label: domain.trim() })),
      ...[...capabilitiesIn(`${item.claim} ${item.context ?? ""}`)].map((capability) => ({ capability, label: null })),
    ].filter((entry) => entry.capability);

    if (!contributions.length) {
      unclassified += 1;
      continue;
    }

    const role = item.career_role ?? (item.career_role_id ? roleById.get(item.career_role_id) ?? null : null);
    const weight = confidenceWeight[item.confidence] ?? 2;

    for (const { capability, label } of contributions) {
      const key = comparisonForm(capability);
      if (!key) continue;

      const bucket = buckets.get(key) ?? {
        capability, names: [], evidenceIds: [], employers: new Set<string>(), weight: 0,
        earliest: null, latest: null, current: false, best: null,
      };

      if (label) bucket.names.push(label);
      if (!bucket.evidenceIds.includes(item.id)) bucket.evidenceIds.push(item.id);
      bucket.weight += weight;

      if (role) {
        bucket.employers.add(comparisonForm(role.employer));
        if (role.start_date && (!bucket.earliest || role.start_date < bucket.earliest)) {
          bucket.earliest = role.start_date;
        }
        if (role.is_current) bucket.current = true;
        else if (role.end_date && (!bucket.latest || role.end_date > bucket.latest)) {
          bucket.latest = role.end_date;
        }
      }

      if (!bucket.best || weight > bucket.best.weight) {
        bucket.best = { claim: item.claim, weight };
      }

      buckets.set(key, bucket);
    }
  }

  const skills: SkillSummary[] = [...buckets.values()].map((bucket) => {
    const evidenceCount = bucket.evidenceIds.length;
    const employerCount = bucket.employers.size;

    return {
      // Their wording when they gave one; the capability only as a fallback.
      name: bucket.names.length ? displayName(bucket.names) : bucket.capability,
      capability: bucket.capability,
      evidenceCount,
      evidenceIds: bucket.evidenceIds,
      employerCount,
      years: yearsBetween(bucket.earliest, bucket.current ? null : bucket.latest),
      current: bucket.current,
      strength: gradeStrength(evidenceCount, employerCount, bucket.weight),
      topClaim: bucket.best?.claim ?? null,
    };
  });

  const order: Record<SkillStrength, number> = { core: 0, strong: 1, supporting: 2, emerging: 3 };
  skills.sort(
    (a, b) =>
      order[a.strength] - order[b.strength] ||
      b.evidenceCount - a.evidenceCount ||
      b.employerCount - a.employerCount ||
      a.name.localeCompare(b.name),
  );

  return { skills, totalApproved: approved.length, unclassified };
}
