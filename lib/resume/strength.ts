import type { CareerRoleRecord, EvidenceRecord } from "@/lib/types";
import type { SkillProfile } from "@/lib/matching/skill-profile";

/*
 * What would make this résumé stronger.
 *
 * Deterministic on purpose. Every finding here is a fact about the record —
 * this claim carries no number, that role has no dates — so it can be stated
 * without a model, without a per-use cost, and without the risk of inventing
 * advice. A suggestion you can verify by looking is worth more than a
 * confident paragraph you cannot.
 *
 * The checks are the ones an interviewer applies without announcing them: can
 * you say what changed, by how much, over what period, and can you prove it
 * happened more than once.
 */

export type FindingSeverity = "high" | "medium" | "low";

export type Finding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  detail: string;
  /** Evidence this finding is about, so it can be acted on rather than admired. */
  evidenceIds: string[];
  count: number;
};

export type ResumeStrength = {
  /** 0–100. Not a grade out of vanity — it moves when a finding is fixed. */
  score: number;
  quantified: number;
  approved: number;
  findings: Finding[];
};

/*
 * A figure, a percentage, a currency amount, a duration or a scale. Deliberately
 * broad: the check is "does this say how much", not "is it formatted well".
 */
const NUMBER = /(\d[\d,.]*\s*(%|percent|k\b|m\b|bn\b|million|billion|users|people|devices|countries|sites|hours|days|weeks|months|years|fte)|[£$€]\s*\d|\b\d[\d,.]*\b)/i;

const VAGUE_OPENERS = /^(responsible for|involved in|assisted with|helped with|worked on|participated in|supported the|part of)/i;

function pick(items: EvidenceRecord[], limit = 12) {
  return items.slice(0, limit).map((item) => item.id);
}

export function assessResume(
  evidence: EvidenceRecord[],
  roles: CareerRoleRecord[],
  profile: SkillProfile,
): ResumeStrength {
  const approvedItems = evidence.filter((item) => item.approval_status === "approved");
  const approved = approvedItems.length;

  if (!approved) {
    return { score: 0, quantified: 0, approved: 0, findings: [] };
  }

  const findings: Finding[] = [];

  /*
   * The single biggest difference between a résumé that gets a call and one
   * that does not. "Improved service quality" and "cut major incidents 40%"
   * describe the same work and are not the same claim.
   */
  const unquantified = approvedItems.filter(
    (item) => !item.metrics.length && !NUMBER.test(item.claim),
  );
  const quantified = approved - unquantified.length;

  if (unquantified.length) {
    findings.push({
      id: "no-number",
      severity: unquantified.length > approved / 2 ? "high" : "medium",
      title: `${unquantified.length} claim${unquantified.length === 1 ? "" : "s"} say what you did, not how much`,
      detail:
        "An interviewer's first question is scale. Add the number you already know — how many users, how much money, how much faster — and the claim stops being an assertion.",
      evidenceIds: pick(unquantified),
      count: unquantified.length,
    });
  }

  const vague = approvedItems.filter((item) => VAGUE_OPENERS.test(item.claim.trim()));
  if (vague.length) {
    findings.push({
      id: "vague-opener",
      severity: "medium",
      title: `${vague.length} claim${vague.length === 1 ? "" : "s"} describe involvement rather than ownership`,
      detail:
        "“Responsible for” and “involved in” hide whether you led it or attended it. Say what you did and the reader stops guessing.",
      evidenceIds: pick(vague),
      count: vague.length,
    });
  }

  const thin = approvedItems.filter((item) => item.claim.trim().split(/\s+/).length < 8);
  if (thin.length) {
    findings.push({
      id: "too-short",
      severity: "low",
      title: `${thin.length} claim${thin.length === 1 ? "" : "s"} too short to carry an interview`,
      detail:
        "A few words survive a skim and collapse under a follow-up question. Say what the situation was and what changed because of you.",
      evidenceIds: pick(thin),
      count: thin.length,
    });
  }

  const unattributed = approvedItems.filter((item) => !item.career_role_id);
  if (unattributed.length) {
    findings.push({
      id: "unattributed",
      severity: "medium",
      title: `${unattributed.length} claim${unattributed.length === 1 ? "" : "s"} not tied to a role`,
      detail:
        "A claim floating free of an employer and a date is hard to defend and impossible to sequence. Attach each one to where it happened.",
      evidenceIds: pick(unattributed),
      count: unattributed.length,
    });
  }

  const untagged = approvedItems.filter((item) => !item.domains.length);
  if (untagged.length) {
    findings.push({
      id: "untagged",
      severity: "low",
      title: `${untagged.length} claim${untagged.length === 1 ? "" : "s"} carry no skill`,
      detail:
        "These are invisible to your skill set, so a role asking for that skill will not see that you have it.",
      evidenceIds: pick(untagged),
      count: untagged.length,
    });
  }

  const undated = roles.filter((role) => !role.start_date);
  if (undated.length) {
    findings.push({
      id: "undated-role",
      severity: "medium",
      title: `${undated.length} role${undated.length === 1 ? "" : "s"} without a start date`,
      detail:
        "Without dates Sartho cannot work out how long you have done anything, so every skill loses its years.",
      evidenceIds: [],
      count: undated.length,
    });
  }

  const singleMention = profile.skills.filter((skill) => skill.evidenceCount === 1);
  if (singleMention.length >= 3) {
    findings.push({
      id: "thin-skills",
      severity: "low",
      title: `${singleMention.length} skills rest on a single claim`,
      detail:
        `${singleMention.slice(0, 4).map((skill) => skill.name).join(", ")}${singleMention.length > 4 ? " and others" : ""} appear once. One mention reads as exposure rather than depth — add a second example, or let them sit as exposure honestly.`,
      evidenceIds: [],
      count: singleMention.length,
    });
  }

  /*
   * Weighted by what actually costs a candidate an interview, not by count.
   * Quantification carries the most because it is the thing a reader looks for
   * first and the thing most résumés are missing.
   */
  const quantifiedShare = quantified / approved;
  const attributedShare = (approved - unattributed.length) / approved;
  const specificShare = (approved - vague.length - thin.length) / approved;
  const datedShare = roles.length ? (roles.length - undated.length) / roles.length : 1;

  const score = Math.round(
    Math.max(0, Math.min(1, quantifiedShare)) * 45 +
      Math.max(0, Math.min(1, specificShare)) * 25 +
      Math.max(0, Math.min(1, attributedShare)) * 20 +
      Math.max(0, Math.min(1, datedShare)) * 10,
  );

  const order: Record<FindingSeverity, number> = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);

  return { score, quantified, approved, findings };
}
