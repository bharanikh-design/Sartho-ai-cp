import { describe, expect, it } from "vitest";
import { assessResume } from "./strength";
import type { CareerRoleRecord, EvidenceRecord } from "@/lib/types";
import type { SkillProfile } from "@/lib/matching/skill-profile";

const emptyProfile: SkillProfile = { skills: [], totalApproved: 0, unclassified: 0 };

function claim(id: string, text: string, extra: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id, user_id: "u", external_key: null, career_role_id: "r1",
    claim: text, context: null, period_label: null,
    metrics: [], domains: ["ITSM"],
    source_name: "cv.pdf", source_locator: null,
    confidence: "medium", approval_status: "approved", safe_for_resume: true,
    created_at: "", updated_at: "", ...extra,
  };
}

const role: CareerRoleRecord = {
  id: "r1", user_id: "u", employer: "Barclays", title: "Head of EUC",
  location: null, start_date: "2019-01-01", end_date: null, is_current: true, summary: null,
};

function findingIds(evidence: EvidenceRecord[], roles = [role], profile = emptyProfile) {
  return assessResume(evidence, roles, profile).findings.map((f) => f.id);
}

describe("assessResume", () => {
  it("says nothing when there is nothing approved", () => {
    const result = assessResume([claim("1", "Anything", { approval_status: "pending" })], [role], emptyProfile);
    expect(result.approved).toBe(0);
    expect(result.findings).toEqual([]);
    expect(result.score).toBe(0);
  });

  it("flags a claim that says what you did but not how much", () => {
    expect(findingIds([claim("1", "Improved the quality of service across the estate")]))
      .toContain("no-number");
  });

  it("accepts a number written in the claim or held as a metric", () => {
    expect(findingIds([claim("1", "Cut major incidents by 40% across the estate")]))
      .not.toContain("no-number");
    expect(findingIds([claim("1", "Cut major incidents across the estate", { metrics: ["40%"] })]))
      .not.toContain("no-number");
  });

  it("recognises money and scale as quantification", () => {
    expect(findingIds([claim("1", "Ran a £4m managed service contract to renewal")]))
      .not.toContain("no-number");
    expect(findingIds([claim("1", "Supported 90,000 users across eleven countries")]))
      .not.toContain("no-number");
  });

  it("flags involvement language that hides whether you led it", () => {
    expect(findingIds([claim("1", "Responsible for the ITSM tooling estate and its 40% growth")]))
      .toContain("vague-opener");
  });

  it("flags a claim too short to survive a follow-up question", () => {
    expect(findingIds([claim("1", "Ran 40% of ITSM")])).toContain("too-short");
  });

  it("flags a claim floating free of any role", () => {
    expect(findingIds([claim("1", "Cut incidents by 40% across the whole estate", { career_role_id: null })]))
      .toContain("unattributed");
  });

  it("flags a claim carrying no skill, because matching cannot see it", () => {
    expect(findingIds([claim("1", "Cut incidents by 40% across the whole estate", { domains: [] })]))
      .toContain("untagged");
  });

  it("flags a role with no start date, because every skill loses its years", () => {
    const undated = { ...role, start_date: null };
    expect(findingIds([claim("1", "Cut incidents by 40% across the estate")], [undated]))
      .toContain("undated-role");
  });

  it("flags skills resting on one mention once there are several", () => {
    const profile: SkillProfile = {
      skills: ["A", "B", "C"].map((name) => ({
        name, evidenceCount: 1, evidenceIds: [], employerCount: 1,
        years: null, current: false, strength: "emerging" as const, topClaim: null,
      })),
      totalApproved: 3, unclassified: 0,
    };
    const ids = findingIds([claim("1", "Cut incidents by 40% across the estate")], [role], profile);
    expect(ids).toContain("thin-skills");
  });

  it("scores a well-formed résumé high and a vague one low", () => {
    const strong = assessResume(
      [
        claim("1", "Cut major incident volume by 40% across a 60,000 device estate"),
        claim("2", "Migrated 42,000 endpoints to Windows 11 across eleven countries"),
      ],
      [role], emptyProfile,
    );
    const weak = assessResume(
      [
        claim("3", "Responsible for service quality"),
        claim("4", "Involved in transformation"),
      ],
      [role], emptyProfile,
    );
    expect(strong.score).toBeGreaterThan(90);
    expect(weak.score).toBeLessThan(40);
    expect(strong.score).toBeGreaterThan(weak.score);
  });

  it("counts how many claims carry a number", () => {
    const result = assessResume(
      [
        claim("1", "Cut incidents by 40% across the estate"),
        claim("2", "Improved things generally for everyone"),
      ],
      [role], emptyProfile,
    );
    expect(result.quantified).toBe(1);
    expect(result.approved).toBe(2);
  });

  it("puts the most damaging finding first", () => {
    const result = assessResume(
      [
        claim("1", "Improved service quality for the estate"),
        claim("2", "Improved reporting for the estate"),
        claim("3", "Improved onboarding for the estate"),
      ],
      [role], emptyProfile,
    );
    expect(result.findings[0].id).toBe("no-number");
    expect(result.findings[0].severity).toBe("high");
  });
});
