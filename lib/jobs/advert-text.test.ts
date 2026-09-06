import { describe, expect, it } from "vitest";
import { extractAdvertText, stripMarkup } from "@/lib/jobs/advert-text";
import { demandsMoreExperience, requiredExperienceIn } from "@/lib/matching/required-experience";

/*
 * The advert that started this. A graduate set their experience to 0–1 years
 * and was shown a finance role asking for three, because the only text Sartho
 * ever received was the opening paragraph — the requirement lives far below it.
 */
const REAL_REQUIREMENT =
  "SKILLS &amp; EXPERIENCE:</p><p>This role will suit someone with at least 3 years&rsquo; experience in a finance role, "
  + "along with a Bachelor&rsquo;s Degree in Business, Commerce (Accounting) or a relevant discipline.";

const page = (body: string, head = "") =>
  `<!DOCTYPE html><html><head>${head}</head><body><div class="advert">${body}</div></body></html>`;

describe("extractAdvertText", () => {
  it("reads the requirement out of an ordinary listing page", () => {
    const text = extractAdvertText(page(
      `<h1>Financial Analyst</h1><p>Join a growing team in Sydney with great benefits and a supportive culture.</p><p>${REAL_REQUIREMENT}</p>`,
    ));
    expect(text).toContain("at least 3 years' experience");

    /* And the whole point: with that text, the filter finally does its job. */
    const required = requiredExperienceIn(text ?? "");
    expect(required.minYears).toBe(3);
    expect(demandsMoreExperience(required, 1)).toBe(true);
  });

  it("prefers the structured description a board publishes", () => {
    const jsonLd = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Financial Analyst",
      description: "<p>About us.</p><ul><li>Minimum of 5 years of experience in financial reporting</li></ul>",
    });
    const text = extractAdvertText(page(
      "<p>Some navigation chrome and a cookie banner.</p>",
      `<script type="application/ld+json">${jsonLd}</script>`,
    ));
    expect(text).toContain("Minimum of 5 years of experience");
    expect(text).not.toContain("cookie banner");
  });

  it("finds a posting nested in an @graph", () => {
    const graph = JSON.stringify({
      "@graph": [
        { "@type": "Organization", name: "A board" },
        { "@type": "JobPosting", description: "You will need at least 4 years of experience in audit and assurance work." },
      ],
    });
    const text = extractAdvertText(page("<p>x</p>", `<script type="application/ld+json">${graph}</script>`));
    expect(requiredExperienceIn(text ?? "").minYears).toBe(4);
  });

  it("is not stopped by a malformed structured block", () => {
    const text = extractAdvertText(page(
      `<p>${REAL_REQUIREMENT}</p>`,
      '<script type="application/ld+json">{ broken json</script>',
    ));
    expect(requiredExperienceIn(text ?? "").minYears).toBe(3);
  });

  /*
   * Script bodies are removed, not merely stripped of their tags. A tracking
   * snippet containing "experience" and a version number is not a requirement.
   */
  it("never searches script or style contents", () => {
    const text = extractAdvertText(page(
      `<script>var config = { experience: "10 years", build: 3 };</script>`
      + `<style>.experience { width: 5px }</style>`
      + `<p>We welcome applications from recent graduates with no prior experience required.</p>`,
    ));
    expect(text).not.toContain("var config");
    expect(text).not.toContain("width: 5px");
    expect(requiredExperienceIn(text ?? "").entryFriendly).toBe(true);
  });

  /*
   * The safety property that makes reading a whole page acceptable at all.
   * A footer boast is a larger number than the real requirement, and the reader
   * takes the lowest — so the genuine figure wins and the failure mode is a
   * role kept, never a role wrongly removed.
   */
  it("lets the real requirement beat a footer boast", () => {
    const text = extractAdvertText(page(
      `<p>${REAL_REQUIREMENT}</p>`
      + `<footer>Proudly serving Australian business, with 25 years of experience behind us.</footer>`,
    ));
    expect(requiredExperienceIn(text ?? "").minYears).toBe(3);
  });

  it("returns nothing rather than something useless", () => {
    expect(extractAdvertText("")).toBeNull();
    expect(extractAdvertText("<html><body></body></html>")).toBeNull();
    expect(extractAdvertText("tiny")).toBeNull();
    // @ts-expect-error deliberately wrong, because this reads whatever a server sent
    expect(extractAdvertText(null)).toBeNull();
  });

  it("caps a runaway page", () => {
    const huge = extractAdvertText(page(`<p>${"experience ".repeat(20_000)}</p>`));
    expect((huge ?? "").length).toBeLessThanOrEqual(40_000);
  });
});

describe("stripMarkup", () => {
  it("keeps a bulleted requirement on its own line", () => {
    const text = stripMarkup("<ul><li>5 years of experience</li><li>A degree</li></ul>");
    expect(text.split("\n").filter(Boolean)).toHaveLength(2);
  });

  it("turns the entities adverts are full of back into characters", () => {
    expect(stripMarkup("<p>3 years&rsquo; experience &amp; a degree</p>")).toBe("3 years' experience & a degree");
  });
});
