import { describe, expect, it } from "vitest";
import {
  FAMILY_EDGES,
  JOB_FAMILIES,
  adjacentFamilies,
  familiesOf,
  familyFit,
  familyOfTitle,
  marketTitleIn,
  reachFrom,
  reachableFamilies,
} from "@/lib/matching/job-family";

describe("familyOfTitle", () => {
  it("reads the obvious cases", () => {
    expect(familyOfTitle("Business Analyst")).toBe("Analysis");
    expect(familyOfTitle("Senior Data Analyst")).toBe("Data");
    expect(familyOfTitle("Management Consultant")).toBe("Consulting");
    expect(familyOfTitle("Software Engineer")).toBe("Engineering");
  });

  /*
   * The case this file exists for. "Solutions Consultant" contains the word
   * "consultant" but is a pre-sales job, and a longest-title-first index is the
   * only thing that stops it resolving to Consulting.
   */
  it("puts pre-sales titles in Sales, not Consulting", () => {
    expect(familyOfTitle("Solutions Consultant")).toBe("Sales");
    expect(familyOfTitle("Sales Engineer")).toBe("Sales");
    expect(familyOfTitle("Pre Sales Consultant")).toBe("Sales");
    expect(familyOfTitle("Sales Manager / Solutions Consultant")).toBe("Sales");
  });

  it("has no opinion about a title it does not know", () => {
    expect(familyOfTitle("Chief Vibes Officer")).toBeNull();
    expect(familyOfTitle("")).toBeNull();
  });
});

describe("familyFit", () => {
  const held = ["Business Analyst"];

  it("keeps the same line of work", () => {
    expect(familyFit("Business Analyst", held).withinReach).toBe(true);
    expect(familyFit("Junior Business Analyst", held).withinReach).toBe(true);
  });

  it("keeps a credible neighbour", () => {
    expect(familyFit("Data Analyst", held).withinReach).toBe(true);
    expect(familyFit("Associate Consultant", held).withinReach).toBe(true);
    expect(familyFit("Product Analyst", held).withinReach).toBe(true);
  });

  /* The reported complaint, end to end. */
  it("drops a sales role for a business analyst", () => {
    const fit = familyFit("Solutions Consultant", held);
    expect(fit.withinReach).toBe(false);
    expect(fit.jobFamily).toBe("Sales");
    expect(fit.reason).toContain("different line of work");
  });

  it("drops other unrelated functions", () => {
    expect(familyFit("Registered Nurse", held).withinReach).toBe(false);
    expect(familyFit("Marketing Manager", held).withinReach).toBe(false);
    expect(familyFit("HR Business Partner", held).withinReach).toBe(false);
  });

  it("keeps a sales role for someone who targets sales", () => {
    expect(familyFit("Solutions Consultant", held, ["Account Executive"]).withinReach).toBe(true);
  });

  /*
   * Abstention, both directions. A filter that rejects because it does not
   * recognise something is worse than no filter at all.
   */
  it("keeps the role when it cannot recognise either side", () => {
    expect(familyFit("Chief Vibes Officer", held).withinReach).toBe(true);
    expect(familyFit("Business Analyst", ["Chief Vibes Officer"]).withinReach).toBe(true);
    expect(familyFit("Business Analyst", []).withinReach).toBe(true);
  });
});

describe("the table itself", () => {
  it("gives every title to exactly one family", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const family of JOB_FAMILIES) {
      for (const title of family.titles) {
        const existing = owner.get(title);
        if (existing && existing !== family.id) clashes.push(`"${title}" in ${existing} and ${family.id}`);
        owner.set(title, family.id);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("joins only families that exist, and never one to itself", () => {
    const ids = new Set(JOB_FAMILIES.map((family) => family.id));
    for (const [left, right] of FAMILY_EDGES) {
      expect(ids).toContain(left);
      expect(ids).toContain(right);
      expect(left).not.toBe(right);
    }
  });

  it("states each neighbour once", () => {
    const seen = new Set(FAMILY_EDGES.map(([left, right]) => [left, right].sort().join(" | ")));
    expect(seen.size).toBe(FAMILY_EDGES.length);
  });

  /*
   * Adjacency is mutual by construction now — an undirected edge list rather
   * than a per-family array that had twenty one-way edges in it. This holds the
   * derivation to that promise.
   */
  it("derives adjacency symmetrically", () => {
    for (const family of JOB_FAMILIES) {
      for (const neighbour of adjacentFamilies(family.id)) {
        expect(adjacentFamilies(neighbour)).toContain(family.id);
      }
    }
  });

  it("keeps Analysis and Sales apart", () => {
    expect([...reachableFamilies(["Analysis"])]).not.toContain("Sales");
    expect([...reachableFamilies(["Sales"])]).not.toContain("Analysis");
  });

  it("collects every family a person spans", () => {
    expect([...familiesOf(["Business Analyst", "Data Analyst", "Chief Vibes Officer"])])
      .toEqual(["Analysis", "Data"]);
  });
});

/*
 * A live search on 5 September returned two roles, both wrong, and the reasons
 * were in this file and its callers. These hold the fixes.
 */
describe("the September search regression", () => {
  it("does not let an old shop job open the whole Sales family", () => {
    const held = ["Business Analyst", "Retail Assistant"];
    const targets = ["Business Analyst", "Data Analyst"];

    /* Targets govern: the shop job no longer widens anything. */
    expect(reachFrom(held, targets)).not.toContain("Sales");
    expect(familyFit("Membership Consultant", held, targets).withinReach).toBe(false);

    /* With no targets set, held titles still fill in. */
    expect(reachFrom(held, [])).toContain("Sales");
  });

  it("reads a membership consultant as sales, not consulting", () => {
    expect(familyOfTitle("Club Managers | Assistant Managers | Membership Consultants")).toBe("Sales");
  });

  it("finds the market title inside a composite Career Direction invented", () => {
    expect(marketTitleIn("Risk & Cybersecurity Analyst")).toBe("Cybersecurity Analyst");
    expect(marketTitleIn("Strategy Operations Analyst")).toBe("Operations Analyst");
    expect(marketTitleIn("Chief Vibes Officer")).toBeNull();
  });
});
