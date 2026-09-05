import { candidateSeniority, seniorityOf } from "@/lib/matching/title-fit";

/*
 * Is this role within reach, and if not, by how much?
 *
 * Search filters on this so a person is not shown jobs they cannot get. The
 * pipeline cannot filter — someone deliberately saved that role, and silently
 * hiding it would be worse than showing it — so it says so instead. Both ask
 * the same question here rather than each carrying its own idea of "too
 * senior", which is how a Senior Consultant posting ended up in front of
 * someone with six months of experience.
 */

export const MAX_SENIORITY_STRETCH = 1;

const LEVEL_NAME = ["entry level", "junior", "mid level", "senior", "lead or manager", "head or director"];

export type SeniorityReach = {
  jobLevel: number;
  candidateLevel: number;
  gap: number;
  withinReach: boolean;
  /** Plain wording for the gap, or null when the role is within reach. */
  warning: string | null;
};

export function seniorityReach(
  jobTitle: string,
  heldTitles: string[],
  totalExperienceYears: number | null,
): SeniorityReach {
  const jobLevel = seniorityOf(jobTitle);
  const candidateLevel = candidateSeniority(heldTitles, totalExperienceYears);
  const gap = jobLevel - candidateLevel;
  const withinReach = gap <= MAX_SENIORITY_STRETCH;

  return {
    jobLevel,
    candidateLevel,
    gap,
    withinReach,
    warning: withinReach
      ? null
      : `This is a ${LEVEL_NAME[jobLevel] ?? "more senior"} role and your experience reads as ${LEVEL_NAME[candidateLevel] ?? "earlier"}. It is ${gap} levels above you — worth reading, but expect the mandatory requirements to ask for years you cannot yet evidence.`,
  };
}
