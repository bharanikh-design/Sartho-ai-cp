import { describe, expect, it } from "vitest";
import { MIN_IMPORT_DESCRIPTION, parseImportedJob } from "@/lib/jobs/imported-job";

const advert = [
  "About the role",
  "• Partner with stakeholders to shape the delivery roadmap.",
  "• Run discovery workshops and write the requirements up.",
  "• Support the change and training effort at go-live.",
  "We are looking for someone with strong communication skills.",
].join("\n");

const captured = {
  title: "Business Analyst",
  company: "Datacom",
  location: "Sydney, NSW",
  description: advert,
  url: "https://www.linkedin.com/jobs/view/4012345678/?refId=x",
  applicants: "Over 200 applicants",
  hiringManager: "Priya Raman",
  readBy: "structured data",
};

describe("parseImportedJob", () => {
  it("accepts a capture and normalises its fields", () => {
    const result = parseImportedJob(captured);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.job.title).toBe("Business Analyst");
    expect(result.job.employer).toBe("Datacom");
    expect(result.job.location).toBe("Sydney, NSW");
    expect(result.job.sourceUrl).toContain("linkedin.com/jobs/view/4012345678");
    expect(result.job.applicants).toBe("Over 200 applicants");
  });

  /*
   * The bullets are what the requirement reader splits on. Flattening them
   * turns a list of requirements into one long sentence it cannot take apart.
   */
  it("keeps the line breaks that separate one requirement from the next", () => {
    const result = parseImportedJob(captured);
    if (!result.ok) throw new Error("expected a job");
    expect(result.job.description.split("\n").length).toBeGreaterThan(3);
  });

  it("collapses runaway blank lines without gluing the advert together", () => {
    const result = parseImportedJob({ ...captured, description: `First line.\n\n\n\n\nSecond line.${advert}` });
    if (!result.ok) throw new Error("expected a job");
    expect(result.job.description).not.toMatch(/\n{3,}/);
    expect(result.job.description).toContain("\n\n");
  });

  /* Two different failures, because the fix a person needs is different. */
  it("says the title is missing when the capture hit the wrong part of the page", () => {
    const result = parseImportedJob({ ...captured, title: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("job title");
  });

  it("says the description is short when the advert was still collapsed", () => {
    const result = parseImportedJob({ ...captured, description: "See more" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("job description");
  });

  it("holds the same floor as the save endpoint", () => {
    const justUnder = "x".repeat(MIN_IMPORT_DESCRIPTION - 1);
    const justOver = "y".repeat(MIN_IMPORT_DESCRIPTION);
    expect(parseImportedJob({ ...captured, description: justUnder }).ok).toBe(false);
    expect(parseImportedJob({ ...captured, description: justOver }).ok).toBe(true);
  });

  /*
   * A source link is something a person clicks months later. It must not be
   * able to be a javascript: URL stored on their behalf — but losing the link
   * is never a reason to lose the role.
   */
  it("drops a link that is not https, and keeps the role", () => {
    for (const url of ["javascript:alert(1)", "http://careers.example.com/1", "file:///etc/passwd", "not a url"]) {
      const result = parseImportedJob({ ...captured, url });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.job.sourceUrl).toBe("");
      expect(result.job.title).toBe("Business Analyst");
    }
  });

  it("trims a title long enough to break the save endpoint", () => {
    const result = parseImportedJob({ ...captured, title: "A".repeat(500) });
    if (!result.ok) throw new Error("expected a job");
    expect(result.job.title.length).toBe(240);
  });

  it("refuses whatever is not a capture at all", () => {
    for (const payload of [null, undefined, "nonsense", 42, []]) {
      expect(parseImportedJob(payload).ok).toBe(false);
    }
  });

  it("fills nothing in rather than inventing an employer", () => {
    const result = parseImportedJob({ title: "Analyst", description: advert });
    if (!result.ok) throw new Error("expected a job");
    expect(result.job.employer).toBe("");
    expect(result.job.location).toBe("");
    expect(result.job.sourceUrl).toBe("");
  });
});
