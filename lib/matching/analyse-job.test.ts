import { describe, expect, it } from "vitest";
import { analyseJobDescription } from "./analyse-job";
import type { SkillProfile, SkillStrength } from "./skill-profile";

function skill(name: string, strength: SkillStrength, evidenceCount = 3) {
  return { name, strength, evidenceCount, evidenceIds: [], employerCount: 1, years: 3, current: false, topClaim: null };
}

function profileOf(...skills: ReturnType<typeof skill>[]): SkillProfile {
  return { skills, totalApproved: skills.length, unclassified: 0 };
}

const longEnough = (body: string) => body.padEnd(140, " and other responsibilities ");

describe("analyseJobDescription", () => {
  it("refuses to judge a role when there is no approved evidence", () => {
    const result = analyseJobDescription(
      longEnough("We need a Head of End User Computing to run a ServiceNow programme"),
      { skills: [], totalApproved: 0, unclassified: 0 },
    );
    expect(result.recommendation).toBe("review");
    expect(result.matchedSkills).toEqual([]);
    expect(result.explanation).toMatch(/no approved evidence/i);
  });

  it("refuses to judge a description too short to read", () => {
    const result = analyseJobDescription("Head of EUC", profileOf(skill("EUC", "core")));
    expect(result.explanation).toMatch(/complete job description/i);
  });

  it("matches only skills the user can actually evidence", () => {
    const result = analyseJobDescription(
      longEnough("You will lead our Kubernetes platform and own the Terraform estate"),
      profileOf(skill("ServiceNow", "core"), skill("Kubernetes", "supporting")),
    );
    expect(result.matchedSkills.map((s) => s.name)).toEqual(["Kubernetes"]);
    expect(result.unusedStrengths).toEqual(["ServiceNow"]);
  });

  it("recommends applying when the role calls for several leading skills", () => {
    const result = analyseJobDescription(
      longEnough("Lead our ServiceNow platform and the wider ITSM transformation programme"),
      profileOf(skill("ServiceNow", "core", 6), skill("ITSM", "strong", 4)),
    );
    expect(result.recommendation).toBe("apply");
    expect(result.coverage).toBe(100);
    expect(result.primaryStrength).toBe("ServiceNow");
    expect(result.confidence).toBe("high");
  });

  it("recommends review when only a minor skill is called for", () => {
    const result = analyseJobDescription(
      longEnough("The successful candidate will spend most of their time on Terraform"),
      profileOf(skill("ServiceNow", "core"), skill("ITSM", "strong"), skill("Terraform", "emerging", 1)),
    );
    expect(result.recommendation).toBe("review");
    expect(result.coverage).toBe(0);
    expect(result.confidence).toBe("low");
  });

  it("says skip honestly when the role touches nothing they can evidence", () => {
    const result = analyseJobDescription(
      longEnough("We are hiring a pastry chef for our flagship restaurant in Lyon"),
      profileOf(skill("ServiceNow", "core"), skill("ITSM", "strong")),
    );
    expect(result.recommendation).toBe("skip");
    expect(result.matchedSkills).toEqual([]);
    expect(result.explanation).toMatch(/cannot show that you belong/i);
  });

  it("names the leading skills a role ignores, so a pivot is visible", () => {
    const result = analyseJobDescription(
      longEnough("You will own our ITSM tooling end to end across the group"),
      profileOf(skill("ServiceNow", "core"), skill("End User Computing", "core"), skill("ITSM", "strong")),
    );
    expect(result.unusedStrengths).toEqual(["ServiceNow", "End User Computing"]);
  });

  it("matches whole terms rather than substrings", () => {
    // "R" must not match every word containing the letter, and SAP must not
    // fire on "sapphire".
    const result = analyseJobDescription(
      longEnough("Our sapphire programme requires strong reporting and rigour"),
      profileOf(skill("R", "supporting"), skill("SAP", "core")),
    );
    expect(result.matchedSkills).toEqual([]);
  });

  it("matches a multi-word skill regardless of punctuation and case", () => {
    const result = analyseJobDescription(
      longEnough("Experience of END-USER COMPUTING at scale is essential for this post"),
      profileOf(skill("End User Computing", "core")),
    );
    expect(result.matchedSkills.map((s) => s.name)).toEqual(["End User Computing"]);
  });

  it("carries no hard-coded career terms of its own", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./analyse-job.ts", import.meta.url), "utf8"),
    );
    // The signals must come from the profile, never from this file.
    for (const term of ["servicenow", "euc", "itsm", "digital workplace", "intune", "sccm"]) {
      expect(source.toLowerCase()).not.toContain(term);
    }
  });
});
