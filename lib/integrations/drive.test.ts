import { describe, expect, it } from "vitest";
import { buildDriveQuery, downloadFileName, looksLikeResume, readCandidates, sortByRecency } from "@/lib/integrations/drive";
import { describeAge } from "@/components/drive-resume-picker";

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const GDOC = "application/vnd.google-apps.document";

/*
 * Drive's `contains` is a substring match with no word boundaries, so the
 * query has to be generous and the filtering strict. Everything with the two
 * letters "cv" anywhere in it comes back — archive.pdf, Invoices.docx — and a
 * list of ninety files is the same problem the person already had.
 */
describe("what counts as a résumé", () => {
  it("recognises the words people actually use", () => {
    for (const name of ["Resume.pdf", "résumé 2026.docx", "Curriculum Vitae.pdf", "my-cv.pdf", "CV (1).docx", "cv_2024.pdf", "PRIYA RESUME FINAL.docx"]) {
      expect(looksLikeResume(name)).toBe(true);
    }
  });

  it("does not treat every file with c and v in it as a CV", () => {
    for (const name of ["archive.pdf", "Invoices.docx", "receipts.pdf", "convert.txt", "Q3 revenue.pdf"]) {
      expect(looksLikeResume(name)).toBe(false);
    }
  });

  it("asks Drive only for file types the reader can actually open", () => {
    const query = buildDriveQuery();
    expect(query).toContain("trashed = false");
    expect(query).toContain("application/pdf");
    expect(query).toContain(GDOC);
    /* Name matches, not full text: a cover letter mentions a résumé, it is not one. */
    expect(query).toContain("name contains 'resume'");
    expect(query).not.toContain("fullText");
  });
});

describe("which one is current", () => {
  const file = (name: string, modifiedTime: string, extra: Record<string, unknown> = {}) =>
    ({ id: name, name, mimeType: DOCX, modifiedTime, ...extra });

  it("puts the most recently edited first, which is the whole point", () => {
    const candidates = readCandidates([
      file("Resume old.docx", "2024-01-01T00:00:00Z"),
      file("Resume newest.docx", "2026-09-01T00:00:00Z"),
      file("Resume middle.docx", "2025-06-01T00:00:00Z"),
    ]);
    expect(candidates.map((c) => c.name)).toEqual(["Resume newest.docx", "Resume middle.docx", "Resume old.docx"]);
  });

  /*
   * Missing metadata is not evidence of being current. Sorting an unknown to
   * the top of a list headed "most recently edited" would be a claim Sartho
   * cannot support — and somebody is about to act on it.
   */
  it("sorts a file with no date last, never first", () => {
    const candidates = sortByRecency([
      { id: "a", name: "CV unknown.pdf", mimeType: DOCX, modifiedTime: "", sizeBytes: null, isGoogleDoc: false, folder: null },
      { id: "b", name: "CV dated.pdf", mimeType: DOCX, modifiedTime: "2020-01-01T00:00:00Z", sizeBytes: null, isGoogleDoc: false, folder: null },
    ]);
    expect(candidates.map((c) => c.name)).toEqual(["CV dated.pdf", "CV unknown.pdf"]);
  });

  it("drops what came back only because Drive matches substrings", () => {
    const candidates = readCandidates([
      file("Resume.docx", "2026-01-01T00:00:00Z"),
      file("archive.docx", "2026-02-01T00:00:00Z"),
    ]);
    expect(candidates.map((c) => c.name)).toEqual(["Resume.docx"]);
  });

  it("marks a Google Doc, which has to be exported rather than downloaded", () => {
    const [doc] = readCandidates([file("CV.gdoc", "2026-01-01T00:00:00Z", { mimeType: GDOC })]);
    expect(doc.isGoogleDoc).toBe(true);
    /* It reports no size, because it has no bytes until it is exported. */
    expect(doc.sizeBytes).toBeNull();
  });

  it("names the folder so two files called Resume.pdf are tellable apart", () => {
    const [first] = readCandidates(
      [file("Resume.pdf", "2026-01-01T00:00:00Z", { parents: ["folder-1"] })],
      new Map([["folder-1", "Job hunt 2026"]]),
    );
    expect(first.folder).toBe("Job hunt 2026");
  });

  it("skips a record missing the fields that make it usable", () => {
    expect(readCandidates([{ name: "Resume.pdf" }, { id: "x" }, {}])).toEqual([]);
  });
});

/*
 * A Google Doc exported as .docx needs a filename that says so, or the résumé
 * reader picks its parser from an extension that is not there.
 */
describe("the exported filename", () => {
  it("adds .docx to a Google Doc and leaves everything else alone", () => {
    expect(downloadFileName("My CV", true)).toBe("My CV.docx");
    expect(downloadFileName("My CV.docx", true)).toBe("My CV.docx");
    expect(downloadFileName("My CV.pdf", false)).toBe("My CV.pdf");
  });
});

/*
 * "3 days ago", not a timestamp. The question in somebody's head is "which is
 * the newest one", and a date makes them do the subtraction themselves.
 */
describe("how old a file is said to be", () => {
  const now = Date.parse("2026-09-07T12:00:00Z");
  const ago = (days: number) => new Date(now - days * 86_400_000).toISOString();

  it("says it the way a person would", () => {
    expect(describeAge(ago(0), now)).toBe("edited today");
    expect(describeAge(ago(1), now)).toBe("edited yesterday");
    expect(describeAge(ago(9), now)).toBe("edited 9 days ago");
    expect(describeAge(ago(70), now)).toBe("edited 2 months ago");
    expect(describeAge(ago(800), now)).toBe("edited 2 years ago");
  });

  it("admits when it does not know rather than guessing at today", () => {
    expect(describeAge("", now)).toBe("date unknown");
    expect(describeAge("not a date", now)).toBe("date unknown");
  });
});
