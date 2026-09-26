import { describe, expect, it } from "vitest";
import { emptyContent } from "./content";
import { recommendTemplate } from "./template-recommendation";

const profileSummary = (summary: string) => ({ ...emptyContent(), targetRole: "Operations Manager", summary });

/*
 * `reasons: string[]` became `reason` plus `marketNote`. The rule did not
 * change — the same profiles still resolve to the same templates, and those
 * assertions are untouched below. What changed is that callers no longer have
 * to index into an array to find the sentence that is about the template: the
 * market's own guidance is no longer bundled in, because the Studio prints it
 * verbatim in the block directly above and it was appearing twice.
 */

describe("resume template recommendation", () => {
  it("recognises a mechanical engineer applying in the UK", () => {
    const content = {
      ...emptyContent(),
      targetRole: "Senior Mechanical Engineer",
      summary: "Mechanical engineering consultant delivering HVAC and infrastructure programmes.",
      skills: ["AutoCAD", "Revit", "ASME"],
    };
    const result = recommendTemplate(content, "uk");
    expect(result.template).toBe("engineering");
    expect(result.reason).toContain("engineering-led");
  });

  it("recommends systems for a US technology profile", () => {
    const content = { ...emptyContent(), targetRole: "Platform Engineer", skills: ["AWS", "Kubernetes", "DevOps"] };
    expect(recommendTemplate(content, "us").template).toBe("systems");
  });

  it("uses an executive layout for senior consulting leadership", () => {
    const content = { ...emptyContent(), targetRole: "Engagement Manager", summary: "Client engagement and transformation consulting leader." };
    expect(recommendTemplate(content, "sg").template).toBe("executive");
  });

  it("falls back to a restrained single column when nothing matches", () => {
    const content = { ...emptyContent(), targetRole: "Store Manager", summary: "Retail operations and rostering." };
    const result = recommendTemplate(content, "global");
    expect(result.template).toBe("modern");
    expect(result.reason).toMatch(/restrained|single-column/i);
  });

  it("explains itself only when the market moved the pick", () => {
    /*
     * marketNote is the one thing that needs saying twice: the résumé pointed
     * one way and the market convention pointed another. When they agree,
     * saying so is noise, so it is null.
     */
    const engineer = {
      ...emptyContent(),
      targetRole: "Senior Mechanical Engineer",
      skills: ["SolidWorks", "ASME"],
    };
    expect(recommendTemplate(engineer, "uk").marketNote, "content and market agree").toBeNull();

    /*
     * The content says `modern`; the Gulf does not list it, so the pick moves
     * to that market's first winner. Asserted unconditionally — a test that
     * only checks the interesting branch when it happens to be taken stops
     * noticing the day it stops being taken.
     */
    const retail = { ...emptyContent(), targetRole: "Store Manager" };
    const moved = recommendTemplate(retail, "gcc");
    expect(moved.template).toBe("meridian");
    expect(moved.marketNote).toContain("UAE / GCC");
    expect(moved.marketNote).toContain("Meridian");
  });

  it("keeps engineering whatever market it is going to", () => {
    /*
     * The one deliberate override. Standards and certifications need their own
     * standing wherever an engineer applies; no market prefers burying them,
     * so this must not be reduced to a market winner.
     */
    const engineer = { ...emptyContent(), targetRole: "Functional Safety Engineer", skills: ["ISO 26262"] };
    for (const market of ["us", "au", "uk", "sg", "gcc", "in", "global"] as const) {
      expect(recommendTemplate(engineer, market).template, `engineering in ${market}`).toBe("engineering");
    }
  });

  /*
   * corpus() joins the role, summary, every bullet, every skill and every
   * certification into one string, so a short unanchored alternative will be
   * found in any résumé long enough. These were all real matches before the
   * boundaries went on: "detail", "available" and "training" each contain
   * "ai", "decade" contains "cad", and "revitalised" contains "revit". The
   * effect was that a retail manager describing themselves as detail-oriented
   * was told their profile was technology-led.
   */
  describe("ordinary words are not technical signals", () => {
    const profile = (summary: string) => ({ ...emptyContent(), targetRole: "Store Manager", summary });

    for (const summary of [
      "Detail-oriented operator, available immediately.",
      "Training lead across a retail estate.",
      "A decade of delivery experience.",
      "Revitalised the programme and chaired the steering group.",
      "Bimonthly reporting to a civilian oversight board.",
    ]) {
      it(`does not read "${summary}" as technical`, () => {
        expect(recommendTemplate(profile(summary), "global").template).toBe("modern");
      });
    }
  });

  describe("the real signals still land", () => {
    const withSkills = (targetRole: string, skills: string[]) => ({ ...emptyContent(), targetRole, skills });

    it("still reads genuine engineering tooling", () => {
      for (const skills of [["AutoCAD"], ["CAD modelling"], ["BIM coordination"], ["Revit"], ["ISO 26262"], ["ASME"]]) {
        expect(recommendTemplate(withSkills("Design Lead", skills), "global").template, skills[0]).toBe("engineering");
      }
    });

    it("still reads genuine technology tooling", () => {
      for (const skills of [["AI and machine learning"], ["AWS"], ["Kubernetes"], ["DevOps"], ["data platform"]]) {
        expect(recommendTemplate(withSkills("Delivery Lead", skills), "global").template, skills[0]).toBe("systems");
      }
    });

    it("keeps civil engineering while letting a civilian transition past", () => {
      expect(recommendTemplate(withSkills("Civil Engineer", ["civil works"]), "global").template).toBe("engineering");
      expect(recommendTemplate(profileSummary("Transition to a civilian role after military service."), "global").template).toBe("modern");
    });
  });

  it("never offers the chosen template back as an alternative", () => {
    const content = { ...emptyContent(), targetRole: "Platform Engineer", skills: ["Kubernetes"] };
    const result = recommendTemplate(content, "us");
    expect(result.alternatives).not.toContain(result.template);
    expect(result.alternatives.length).toBeLessThanOrEqual(3);
  });
});
