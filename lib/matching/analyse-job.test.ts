import { describe, expect, it } from "vitest";
import { analyseJobDescription } from "./analyse-job";
import { capabilityForLabel } from "./skill-vocabulary";
import { scoreTitleFit } from "./title-fit";
import type { SkillProfile, SkillStrength } from "./skill-profile";

/* Mirrors buildSkillProfile: the person's wording, resolved to a capability. */
function skill(name: string, strength: SkillStrength, evidenceCount = 3) {
  return {
    name,
    capability: capabilityForLabel(name),
    strength,
    evidenceCount,
    evidenceIds: [],
    employerCount: 1,
    years: 3,
    current: false,
    topClaim: null,
  };
}

function profileOf(...skills: ReturnType<typeof skill>[]): SkillProfile {
  return { skills, totalApproved: skills.length, unclassified: 0 };
}

const longEnough = (body: string) => body.padEnd(140, " and other responsibilities ");

describe("analyseJobDescription", () => {
  it("refuses to judge a role before the Career Profile is confirmed", () => {
    const result = analyseJobDescription(
      longEnough("We need a Head of End User Computing to run a ServiceNow programme"),
      { skills: [], totalApproved: 0, unclassified: 0 },
    );
    expect(result.recommendation).toBe("review");
    expect(result.matchedSkills).toEqual([]);
    expect(result.explanation).toMatch(/confirmed Career Profile/i);
  });

  it("refuses to judge a description too short to read", () => {
    const result = analyseJobDescription("Head of EUC", profileOf(skill("EUC", "core")));
    expect(result.explanation).toMatch(/complete job description/i);
  });

  it("matches only skills the user can actually evidence", () => {
    const result = analyseJobDescription(
      longEnough("You will lead our Kubernetes platform and own the Terraform estate"),
      profileOf(skill("Retail", "core"), skill("Kubernetes", "supporting")),
    );
    expect(result.matchedSkills.map((s) => s.name)).toEqual(["Kubernetes"]);
    expect(result.unusedStrengths).toEqual(["Retail"]);
  });

  it("recommends applying when the role calls for several leading skills", () => {
    /*
     * The advert names four capabilities, not two. It used to name two and
     * still assert full coverage — which is the shape of the bug this file's
     * discount now catches, so the fixture has to mean what the test says.
     */
    const result = analyseJobDescription(
      longEnough(
        "You will own requirements gathering, the BRD and dashboards for our reporting suite, "
        + "run sprint planning with the delivery squad and lead stakeholder engagement across the business",
      ),
      profileOf(
        skill("Business analysis", "core", 6),
        skill("Data analysis", "strong", 4),
        skill("Agile delivery", "strong", 4),
        skill("Stakeholder management", "strong", 3),
      ),
    );
    expect(result.recommendation).toBe("apply");
    expect(result.requirementCoverage).toBe(100);
    expect(result.primaryStrength).toBe("Business analysis");
    expect(result.confidence).toBe("high");
  });

  it("recommends review when only a minor skill is called for", () => {
    const result = analyseJobDescription(
      longEnough("The successful candidate will spend most of their time on Terraform"),
      profileOf(skill("Business analysis", "core"), skill("Data analysis", "strong"), skill("Terraform", "emerging", 1)),
    );
    expect(result.recommendation).toBe("review");
    expect(result.confidence).toBe("low");
  });

  it("says skip honestly when the role touches nothing they can evidence", () => {
    const result = analyseJobDescription(
      longEnough("We are hiring a pastry chef for our flagship restaurant in Lyon"),
      profileOf(skill("Business analysis", "core"), skill("Data analysis", "strong")),
    );
    expect(result.recommendation).toBe("skip");
    expect(result.matchedSkills).toEqual([]);
    expect(result.explanation).toMatch(/cannot yet show a strong fit/i);
  });

  it("names the leading skills a role ignores, so a pivot is visible", () => {
    const result = analyseJobDescription(
      longEnough("You will own the sprint backlog and run agile ceremonies across the group"),
      profileOf(skill("Retail", "core"), skill("Finance", "core"), skill("Agile delivery", "strong")),
    );
    expect(result.unusedStrengths).toEqual(["Retail", "Finance"]);
  });

  it("matches whole terms rather than substrings", () => {
    // "R" must not match every word containing the letter, and SAP must not
    // fire on "sapphire".
    const result = analyseJobDescription(
      longEnough("Our sapphire programme requires rigour and careful judgement throughout"),
      profileOf(skill("R", "supporting")),
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

  /*
   * The regression this rewrite exists for. A Business Analyst reading a
   * Business Analyst advert used to score zero, because the advert never says
   * the word filed against their evidence.
   */
  it("recognises requirements work however the advert phrases it", () => {
    const jd = longEnough(
      "Construct the RTM to track business requirements through design, build and test. "
      + "Assist in backlog grooming and identifying the MVP for each wave. Produce the BRD.",
    );
    const result = analyseJobDescription(jd, profileOf(skill("Consulting", "core", 5)), {
      titleFit: scoreTitleFit("Business Analyst", ["Business Analyst"], []),
    });

    expect(result.titleFit).toBe(100);
    expect(result.closestTitle).toBe("Business Analyst");
    // The advert's own vocabulary is read, so its asks are visible even when
    // the person cannot yet evidence all of them.
    expect(result.missingRequirements).toContain("Business analysis");
    expect(result.recommendation).not.toBe("skip");
  });

  it("counts a requirement as covered when the evidence resolves to it", () => {
    const jd = longEnough("You will own the BRD, the RTM and requirements elicitation for each release.");
    const result = analyseJobDescription(jd, profileOf(skill("Business analysis", "core", 5)));
    expect(result.missingRequirements).toEqual([]);
    expect(result.requirementsRead).toBe(1);
  });

  /*
   * A live search returned two adverts as unalike as "ESG Due Diligence
   * Managing Consultant" and "Club Managers | Membership Consultants", and both
   * reported "you can evidence 100% of what it asks for". Coverage over one or
   * two legible capabilities is not knowledge of the job, and it was carrying
   * 40% of the score at full strength.
   */
  it("discounts coverage until enough of the advert has been read", () => {
    const thin = analyseJobDescription(
      longEnough("You will own the BRD and the RTM."),
      profileOf(skill("Business analysis", "core", 5)),
    );
    expect(thin.requirementsRead).toBe(1);
    expect(thin.requirementCoverage).toBe(25);

    const full = analyseJobDescription(
      longEnough(
        "You will own the BRD and the RTM, run sprint planning and backlog refinement, "
        + "build dashboards in Power BI, and lead stakeholder engagement workshops.",
      ),
      profileOf(
        skill("Business analysis", "core", 5),
        skill("Agile delivery", "core", 4),
        skill("Data analysis", "core", 4),
        skill("Stakeholder management", "core", 4),
      ),
    );
    expect(full.requirementsRead).toBeGreaterThanOrEqual(4);
    expect(full.requirementCoverage).toBe(100);
  });

  /*
   * One passing mention is a thing somebody has touched, not a thing they can
   * claim. Treating "emerging" as full coverage is how a gym's membership-sales
   * advert came back fully evidenced for an analyst.
   */
  it("does not let an emerging skill cover a requirement", () => {
    const jd = longEnough("You will own the BRD, the RTM and requirements elicitation for each release.");
    const result = analyseJobDescription(jd, profileOf(skill("Business analysis", "emerging", 1)));
    expect(result.missingRequirements).toContain("Business analysis");
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
