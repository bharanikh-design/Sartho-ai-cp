import type { CareerRoleRecord, Confidence, EvidenceRecord } from "@/lib/types";

/*
 * The skill set, built from approved evidence.
 *
 * Derived rather than generated. Every skill here exists because approved
 * evidence says so, and every one can name the claims it rests on — which is
 * the difference between a profile and a list of words someone typed about
 * themselves. No model runs, so this costs nothing, returns instantly, and
 * cannot invent a skill that is not in the evidence base.
 */

export type SkillStrength = "core" | "strong" | "supporting" | "emerging";

export type SkillSummary = {
  name: string;
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
    if (!item.domains.length) {
      unclassified += 1;
      continue;
    }

    const role = item.career_role ?? (item.career_role_id ? roleById.get(item.career_role_id) ?? null : null);
    const weight = confidenceWeight[item.confidence] ?? 2;

    for (const domain of item.domains) {
      const key = comparisonForm(domain);
      if (!key) continue;

      const bucket = buckets.get(key) ?? {
        names: [], evidenceIds: [], employers: new Set<string>(), weight: 0,
        earliest: null, latest: null, current: false, best: null,
      };

      bucket.names.push(domain.trim());
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
      name: displayName(bucket.names),
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
