import { describe, expect, it } from "vitest";
import { detectWorkModels, keepWorkModels } from "./work-model";

const job = (description: string) => ({ description });
const textOf = (item: { description: string }) => item.description;

describe("detectWorkModels", () => {
  it("reads the working pattern an advert states", () => {
    expect(detectWorkModels("Fully remote role, work from home")).toEqual(["Remote"]);
    expect(detectWorkModels("This is a hybrid position")).toEqual(["Hybrid"]);
    expect(detectWorkModels("On-site in our Singapore office")).toEqual(["On-site"]);
  });

  it("is not defeated by a hyphen, a capital or a newline", () => {
    expect(detectWorkModels("ON-SITE working")).toEqual(["On-site"]);
    expect(detectWorkModels("Work\nFrom\nHome")).toEqual(["Remote"]);
    expect(detectWorkModels("onsite role")).toEqual(["On-site"]);
  });

  /*
   * The trap this ordering exists for: a hybrid advert almost always says
   * "remote" too ("hybrid — two days remote"). Reading that as a remote role
   * is exactly how a hybrid job disappears from an on-site-and-hybrid search.
   */
  it("reads a hybrid advert that mentions remote days as hybrid", () => {
    expect(detectWorkModels("Hybrid: three days in the office, two days remote")).toEqual(["Hybrid"]);
  });

  it("says nothing about an advert that says nothing", () => {
    expect(detectWorkModels("Lead the ITSM practice for enterprise clients.")).toEqual([]);
    expect(detectWorkModels("")).toEqual([]);
    expect(detectWorkModels("   ")).toEqual([]);
  });
});

describe("keepWorkModels", () => {
  const listings = [
    job("Fully remote, work from home"),
    job("Hybrid role, two days in the office"),
    job("On-site in our Singapore office"),
    job("Lead the ITSM practice."), // says nothing
  ];

  it("is not a filter when nothing was chosen", () => {
    expect(keepWorkModels(listings, [], textOf)).toEqual({ kept: listings, hidden: 0 });
  });

  /* Somebody who said they are flexible should not have jobs hidden from them. */
  it("is not a filter when the person said they are flexible", () => {
    expect(keepWorkModels(listings, ["Flexible"], textOf)).toEqual({ kept: listings, hidden: 0 });
    expect(keepWorkModels(listings, ["On-site", "Flexible"], textOf)).toEqual({ kept: listings, hidden: 0 });
  });

  it("is not a filter when every pattern was chosen", () => {
    expect(keepWorkModels(listings, ["On-site", "Hybrid", "Remote", "Flexible"], textOf))
      .toEqual({ kept: listings, hidden: 0 });
  });

  /*
   * The reported case: On-site + Hybrid selected. Before this existed the
   * selection did exactly what selecting nothing did.
   */
  it("removes an advert that states only a pattern nobody asked for", () => {
    const { kept, hidden } = keepWorkModels(listings, ["On-site", "Hybrid"], textOf);
    expect(kept.map(textOf)).toEqual([
      "Hybrid role, two days in the office",
      "On-site in our Singapore office",
      "Lead the ITSM practice.",
    ]);
    expect(hidden).toBe(1);
  });

  it("keeps an advert that states no pattern at all", () => {
    const silent = [job("Lead the ITSM practice."), job("Own the CMDB.")];
    expect(keepWorkModels(silent, ["Remote"], textOf)).toEqual({ kept: silent, hidden: 0 });
  });

  it("stands down rather than hand back an empty page", () => {
    const allOnSite = [job("On-site in Singapore"), job("Fully on-site role")];
    expect(keepWorkModels(allOnSite, ["Remote"], textOf)).toEqual({ kept: allOnSite, hidden: 0 });
  });

  it("ignores a value that is not a working pattern", () => {
    expect(keepWorkModels(listings, ["Banana"], textOf)).toEqual({ kept: listings, hidden: 0 });
  });

  it("is a no-op on an empty result set", () => {
    expect(keepWorkModels([], ["Remote"], textOf)).toEqual({ kept: [], hidden: 0 });
  });
});

describe("work model — negative and stress", () => {
  it("never throws on hostile text", () => {
    for (const text of ["", "   ", "\u0000", "🙂".repeat(500), "<script>remote</script>", "-".repeat(10_000)]) {
      expect(() => detectWorkModels(text)).not.toThrow();
    }
  });

  it("filters ten thousand listings quickly", () => {
    const many = Array.from({ length: 10_000 }, (_, index) =>
      job(index % 2 === 0 ? "Fully remote position" : "On-site in Singapore"));

    const started = Date.now();
    const { kept, hidden } = keepWorkModels(many, ["On-site"], textOf);
    expect(kept).toHaveLength(5_000);
    expect(hidden).toBe(5_000);
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});
