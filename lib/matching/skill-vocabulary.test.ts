import { describe, expect, it } from "vitest";
import { CAPABILITIES, capabilitiesIn, capabilityForLabel } from "./skill-vocabulary";

describe("skill vocabulary", () => {
  /*
   * A surface owned by two capabilities makes a job appear to ask for more than
   * it does, which quietly deflates every requirement-coverage score. This
   * caught "reporting" sitting in both Data analysis and Communication.
   */
  it("gives every surface form exactly one capability", () => {
    const owners = new Map<string, string[]>();
    for (const capability of CAPABILITIES) {
      for (const surface of capability.surfaces) {
        owners.set(surface, [...(owners.get(surface) ?? []), capability.id]);
      }
    }
    const shared = [...owners.entries()].filter(([, ids]) => ids.length > 1);
    expect(shared).toEqual([]);
  });

  it("resolves the many ways one capability is written", () => {
    for (const phrase of ["business requirements", "BRD", "requirements elicitation", "RTM"]) {
      expect([...capabilitiesIn(`We need ${phrase} experience`)]).toContain("Business analysis");
    }
  });

  it("matches whole terms only", () => {
    // "ai" must not fire inside "detail", "ba" not inside "database".
    expect([...capabilitiesIn("attention to detail and database work")]).not.toContain("Automation & AI");
  });

  it("folds a résumé's own tag into the shared vocabulary", () => {
    expect(capabilityForLabel("ServiceNow")).toBe("Service management");
    expect(capabilityForLabel("Retail")).toBe("Retail & merchandising");
  });

  it("keeps an unrecognised tag rather than discarding it", () => {
    expect(capabilityForLabel("Underwater basket weaving")).toBe("Underwater basket weaving");
  });
});
