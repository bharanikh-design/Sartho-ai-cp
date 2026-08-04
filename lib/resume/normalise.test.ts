import { describe, expect, it } from "vitest";
import { comparisonForm, evidenceKey, normaliseDate, roleKey, toRows } from "./normalise";

/*
 * These keys are what stop a second upload of the same résumé from doubling
 * someone's career history, so they are worth pinning down rather than
 * assuming.
 */

describe("comparisonForm", () => {
  it("treats the same employer written differently as the same employer", () => {
    expect(comparisonForm("Barclays PLC")).toBe(comparisonForm("barclays  plc"));
    expect(comparisonForm("Marks & Spencer")).toBe(comparisonForm("Marks and Spencer"));
    expect(comparisonForm("Nestlé")).toBe(comparisonForm("Nestle"));
  });

  it("keeps genuinely different employers apart", () => {
    expect(comparisonForm("Barclays")).not.toBe(comparisonForm("Barclaycard"));
  });
});

describe("normaliseDate", () => {
  it("widens a partial date to the start of the period it names", () => {
    expect(normaliseDate("2019")).toBe("2019-01-01");
    expect(normaliseDate("2019-03")).toBe("2019-03-01");
    expect(normaliseDate("2019-03-14")).toBe("2019-03-14");
  });

  it("returns null rather than guessing at anything it cannot read", () => {
    expect(normaliseDate("March 2019")).toBeNull();
    expect(normaliseDate("present")).toBeNull();
    expect(normaliseDate("")).toBeNull();
    expect(normaliseDate(null)).toBeNull();
    expect(normaliseDate(undefined)).toBeNull();
  });

  it("rejects a well-formed date that is not a real one", () => {
    expect(normaliseDate("2019-02-31")).toBeNull();
  });
});

describe("keys", () => {
  it("gives the same role the same key regardless of spelling or spacing", () => {
    expect(roleKey("Barclays PLC", "Head of EUC", "2019-01-01"))
      .toBe(roleKey("barclays plc ", " head of euc", "2019-01-01"));
  });

  it("separates the same title at different employers", () => {
    expect(roleKey("Barclays", "Head of EUC", null))
      .not.toBe(roleKey("HSBC", "Head of EUC", null));
  });

  it("separates the same title at the same employer across different spells", () => {
    expect(roleKey("Barclays", "Head of EUC", "2015-01-01"))
      .not.toBe(roleKey("Barclays", "Head of EUC", "2019-01-01"));
  });

  it("gives the same claim the same key regardless of case and spacing", () => {
    const a = evidenceKey("role:abc", "Cut incident volume by 40%");
    const b = evidenceKey("role:abc", "  cut  incident volume by 40%  ");
    expect(a).toBe(b);
  });

  it("separates the same claim under different roles", () => {
    expect(evidenceKey("role:abc", "Cut incident volume by 40%"))
      .not.toBe(evidenceKey("role:xyz", "Cut incident volume by 40%"));
  });
});

describe("toRows", () => {
  const extracted = {
    roles: [
      {
        employer: "Barclays PLC",
        title: "Head of End User Computing",
        location: "London",
        startDate: "2019-03",
        endDate: null,
        isCurrent: true,
        summary: "Ran the EUC estate.",
      },
    ],
    evidence: [
      {
        employer: "Barclays PLC",
        title: "Head of End User Computing",
        claim: "Reduced major incident volume by 40% across the desktop estate",
        context: "Following a rebuild of the patching pipeline",
        periodLabel: "2019–2021",
        metrics: ["40%", "40%", " "],
        domains: ["EUC", "ITSM", "euc"],
        confidence: "high" as const,
      },
    ],
  };

  it("attaches a claim to the role it belongs to", () => {
    const { roles, evidence } = toRows(extracted, "cv.pdf");
    expect(roles).toHaveLength(1);
    expect(evidence).toHaveLength(1);
    expect(evidence[0].role_external_key).toBe(roles[0].external_key);
  });

  it("produces identical rows when the same résumé is read twice", () => {
    const first = toRows(extracted, "cv.pdf");
    const second = toRows(extracted, "cv.pdf");
    expect(second.roles[0].external_key).toBe(first.roles[0].external_key);
    expect(second.evidence[0].external_key).toBe(first.evidence[0].external_key);
  });

  it("widens a partial start date and carries the current flag", () => {
    const { roles } = toRows(extracted, "cv.pdf");
    expect(roles[0].start_date).toBe("2019-03-01");
    expect(roles[0].end_date).toBeNull();
    expect(roles[0].is_current).toBe(true);
  });

  it("removes duplicate and empty metrics and domains", () => {
    const { evidence } = toRows(extracted, "cv.pdf");
    expect(evidence[0].metrics).toEqual(["40%"]);
    expect(evidence[0].domains).toEqual(["EUC", "ITSM"]);
  });

  it("records where the claim came from", () => {
    const { evidence } = toRows(extracted, "cv.pdf");
    expect(evidence[0].source_name).toBe("cv.pdf");
    expect(evidence[0].source_locator).toContain("Barclays PLC");
  });

  it("drops a claim too short to mean anything", () => {
    const { evidence } = toRows(
      { roles: [], evidence: [{ claim: "Did work", confidence: "low" }] },
      "cv.pdf",
    );
    expect(evidence).toHaveLength(0);
  });

  it("leaves a claim unattached when its employer is not among the roles", () => {
    const { evidence } = toRows(
      {
        roles: [],
        evidence: [{
          employer: "Somewhere Else",
          claim: "Led a migration of forty thousand devices",
          confidence: "medium" as const,
        }],
      },
      "cv.pdf",
    );
    expect(evidence).toHaveLength(1);
    expect(evidence[0].role_external_key).toBeNull();
  });

  it("collapses the same claim repeated under one role", () => {
    const { evidence } = toRows(
      {
        roles: extracted.roles,
        evidence: [extracted.evidence[0], { ...extracted.evidence[0], claim: extracted.evidence[0].claim.toUpperCase() }],
      },
      "cv.pdf",
    );
    expect(evidence).toHaveLength(1);
  });

  it("skips a role missing an employer or a title", () => {
    const { roles } = toRows(
      { roles: [{ employer: "  ", title: "Head of Nothing" }], evidence: [] },
      "cv.pdf",
    );
    expect(roles).toHaveLength(0);
  });
});
