import { describe, expect, it } from "vitest";
import { buildSkillProfile } from "./skill-profile";
import type { CareerRoleRecord, Confidence, EvidenceRecord } from "@/lib/types";

function role(id: string, employer: string, start: string, end: string | null): CareerRoleRecord {
  return {
    id, user_id: "u", employer, title: "Lead", location: null,
    start_date: start, end_date: end, is_current: end === null, summary: null,
  };
}

function claim(
  id: string,
  domains: string[],
  opts: { roleId?: string; approved?: boolean; confidence?: Confidence; text?: string } = {},
): EvidenceRecord {
  return {
    id, user_id: "u", external_key: null,
    career_role_id: opts.roleId ?? null,
    claim: opts.text ?? `Did something measurable with ${domains[0] ?? "nothing"}`,
    context: null, period_label: null, metrics: [], domains,
    source_name: "cv.pdf", source_locator: null,
    confidence: opts.confidence ?? "medium",
    approval_status: opts.approved === false ? "pending" : "approved",
    safe_for_resume: true, created_at: "", updated_at: "",
  };
}

describe("buildSkillProfile", () => {
  it("only counts evidence the user approved", () => {
    const { skills, totalApproved } = buildSkillProfile([
      claim("1", ["ServiceNow"]),
      claim("2", ["Kubernetes"], { approved: false }),
    ]);
    expect(totalApproved).toBe(1);
    expect(skills.map((s) => s.name)).toEqual(["ServiceNow"]);
  });

  it("treats differently spelled domains as one skill", () => {
    const { skills } = buildSkillProfile([
      claim("1", ["End User Computing"]),
      claim("2", ["end-user computing"]),
      claim("3", ["End User Computing"]),
    ]);
    expect(skills).toHaveLength(1);
    expect(skills[0].evidenceCount).toBe(3);
    // keeps the spelling that appears most often
    expect(skills[0].name).toBe("End User Computing");
  });

  it("grades a skill shown repeatedly at several employers as core", () => {
    const roles = [role("r1", "Barclays", "2015-01-01", "2019-01-01"), role("r2", "HSBC", "2019-01-01", null)];
    const { skills } = buildSkillProfile(
      [
        claim("1", ["ITSM"], { roleId: "r1" }),
        claim("2", ["ITSM"], { roleId: "r1" }),
        claim("3", ["ITSM"], { roleId: "r2" }),
        claim("4", ["ITSM"], { roleId: "r2" }),
      ],
      roles,
    );
    expect(skills[0].strength).toBe("core");
    expect(skills[0].employerCount).toBe(2);
    expect(skills[0].current).toBe(true);
  });

  it("grades a single low-confidence mention as emerging", () => {
    const { skills } = buildSkillProfile([claim("1", ["Terraform"], { confidence: "low" })]);
    expect(skills[0].strength).toBe("emerging");
  });

  it("measures years from the roles the skill appears in", () => {
    const roles = [role("r1", "Barclays", "2014-01-01", "2020-01-01")];
    const { skills } = buildSkillProfile([claim("1", ["ITSM"], { roleId: "r1" })], roles);
    expect(skills[0].years).toBe(6);
  });

  it("counts approved evidence with no domains as unclassified rather than dropping it", () => {
    const { skills, unclassified, totalApproved } = buildSkillProfile([
      claim("1", []),
      claim("2", ["ServiceNow"]),
    ]);
    expect(unclassified).toBe(1);
    expect(totalApproved).toBe(2);
    expect(skills).toHaveLength(1);
  });

  it("can name the evidence behind every skill", () => {
    const { skills } = buildSkillProfile([
      claim("a", ["ServiceNow"], { text: "Delivered ServiceNow ITSM to 90,000 users" }),
      claim("b", ["ServiceNow"], { confidence: "high", text: "Ran the platform roadmap for three years" }),
    ]);
    expect(skills[0].evidenceIds).toEqual(["a", "b"]);
    // the strongest claim is the one shown as the receipt
    expect(skills[0].topClaim).toBe("Ran the platform roadmap for three years");
  });

  it("orders strongest first", () => {
    const roles = [role("r1", "A", "2015-01-01", "2018-01-01"), role("r2", "B", "2018-01-01", null)];
    const { skills } = buildSkillProfile(
      [
        claim("1", ["Core"], { roleId: "r1" }), claim("2", ["Core"], { roleId: "r1" }),
        claim("3", ["Core"], { roleId: "r2" }), claim("4", ["Core"], { roleId: "r2" }),
        claim("5", ["Minor"], { roleId: "r1" }),
      ],
      roles,
    );
    expect(skills.map((s) => s.name)).toEqual(["Core", "Minor"]);
  });

  it("returns an empty profile rather than failing when there is no evidence", () => {
    expect(buildSkillProfile([])).toEqual({ skills: [], totalApproved: 0, unclassified: 0 });
  });
});
