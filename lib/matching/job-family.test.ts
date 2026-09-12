import { describe, expect, it } from "vitest";
import {
  FAMILY_EDGES,
  unclassifiedTitles,
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

/*
 * A regression from a real brief that came back empty.
 *
 * Five target roles were set. runBriefSearch capped its lane list at three —
 * a budget, because each role costs a provider call — and then reused that
 * same capped list to decide what line of work the person was in. The fourth
 * and fifth roles carried Change and Project delivery, so truncating left only
 * Consulting, IT operations fell out of reach, and every IT service role the
 * search found was hidden as "a different line of work from Consulting".
 *
 * The brief named IT infrastructure twice and the page showed none of it.
 */
describe("every target role counts toward reach, not just the first few", () => {
  const brief = [
    "ServiceNow Senior Engagement Manager",
    "ServiceNow Business Process Architect / Lead",
    "Enterprise ITSM Practice Lead",
    "EUC and ITSM Transformation Lead",
    "IT Infrastructure & Cloud Migration Program Manager",
  ];
  const held = ["ServiceNow Business Process SME", "Senior Engagement Manager"];

  it("reaches IT operations from the whole brief but not from its first three roles", () => {
    /*
     * Stated as what the two reaches contain rather than as the exact list.
     * The exact list is a property of the title vocabulary, which grows — this
     * test is about truncation, and pinning the vocabulary here only made it
     * fail the next time a title was learned.
     */
    expect(reachFrom(held, brief)).toEqual(expect.arrayContaining(["Consulting", "Change", "Project delivery"]));
    expect(reachFrom(held, brief.slice(0, 3)).length).toBeLessThan(reachFrom(held, brief).length);

    expect(reachableFamilies(reachFrom(held, brief.slice(0, 3))).has("IT operations")).toBe(false);
    expect(reachableFamilies(reachFrom(held, brief)).has("IT operations")).toBe(true);
  });

  it.each([
    "IT Service Delivery Manager",
    "Service Desk Manager",
    "IT Operations Manager",
  ])("keeps %s for this brief", (title) => {
    expect(familyFit(title, held, brief).withinReach).toBe(true);
  });

  /* Still a different job: these are hands-on build roles, not delivery leadership. */
  it("still turns down a hands-on engineering role", () => {
    expect(familyFit("ServiceNow Developer", held, brief).withinReach).toBe(false);
  });
});

/*
 * The failure this vocabulary was extended for, kept as the exact case.
 *
 * A person whose target roles were Engagement Manager, ServiceNow Business
 * Process Architect, Practice Lead, ServiceNow Delivery Director and ITSM
 * Transformation Manager ran a nationwide Singapore search and got one role,
 * with five hidden as "a different line of work from Consulting, Change,
 * Project delivery". The word "ServiceNow" appeared nowhere in this file, so
 * two of their five target roles classified as nothing, contributed nothing to
 * their reach, and the search then hid the service-management jobs they were
 * asking for.
 */
describe("a ServiceNow and ITSM career", () => {
  const TARGETS = [
    "Engagement Manager",
    "ServiceNow Business Process Architect",
    "Practice Lead",
    "ServiceNow Delivery Director",
    "ITSM Transformation Manager",
  ];

  it("recognises every one of those target roles", () => {
    expect(unclassifiedTitles(TARGETS)).toEqual([]);
  });

  it("reaches service management from them", () => {
    expect(reachFrom([], TARGETS)).toContain("IT operations");
  });

  it.each([
    "ServiceNow Developer",
    "ServiceNow Technical Consultant",
    "ServiceNow Platform Architect",
    "ITSM Process Manager",
    "Service Management Lead",
    "IT Service Delivery Manager",
    "Major Incident Manager",
    "Release Manager",
  ])("shows them %j", (title) => {
    expect(familyFit(title, [], TARGETS).withinReach).toBe(true);
  });

  /*
   * The filter still does the job it was built for. A gym's membership-sales
   * advert reaching an analyst is the case that created this file, and
   * widening the vocabulary must not undo it.
   */
  it.each(["Retail Sales Assistant", "Gym Membership Consultant"])("still hides %j", (title) => {
    expect(familyFit(title, [], TARGETS).withinReach).toBe(false);
  });
});

/*
 * A reach built from only some of somebody's target roles is a guess, and
 * hiding on a guess is what produced the failure above. However many titles
 * this table learns, somebody's specialism will eventually not be among them.
 */
describe("when a target role falls through the table", () => {
  const PARTLY_KNOWN = ["Engagement Manager", "Chief Vibes Officer"];

  it("names the title it could not place", () => {
    expect(unclassifiedTitles(PARTLY_KNOWN)).toEqual(["Chief Vibes Officer"]);
  });

  it("hides nothing on family alone", () => {
    /* Sales is not reachable from Consulting, and is shown anyway. */
    expect(familyFit("Retail Sales Assistant", [], PARTLY_KNOWN).withinReach).toBe(true);
  });

  it("still filters when every target role was understood", () => {
    expect(familyFit("Retail Sales Assistant", [], ["Engagement Manager"]).withinReach).toBe(false);
  });

  /*
   * Held titles are not target roles. They are not a deliberate statement
   * about what somebody wants, so an unrecognised one does not stand the
   * filter down — otherwise one odd job from years ago disables it for good.
   */
  it("is not stood down by an unrecognised held title", () => {
    expect(familyFit("Retail Sales Assistant", ["Chief Vibes Officer"], ["Engagement Manager"]).withinReach).toBe(false);
  });

  it("says nothing about a list it understood completely", () => {
    expect(unclassifiedTitles(["Engagement Manager", "Practice Lead"])).toEqual([]);
  });

  it("ignores blanks rather than calling them unrecognised", () => {
    expect(unclassifiedTitles(["Engagement Manager", "  ", ""])).toEqual([]);
  });
});
