import { describe, expect, it } from "vitest";
import {
  contentFromText,
  emptyContent,
  evidenceIdsIn,
  hasContent,
  parseResumeContent,
  renderResumeText,
  resumeContentOf,
  type ResumeContent,
} from "@/lib/resume/content";

const document: ResumeContent = {
  template: "classic",
  headline: "Bharani Kumar K — Business Analyst",
  summary: "Analyst with consulting delivery experience across retail and financial services.",
  sections: [
    {
      id: "s0",
      heading: "CLIENT CONSULTING & STRATEGIC PROJECTS",
      bullets: [
        { id: "s0b0", text: "Delivered an Implementation Roadmap for an AI-assisted solution.", evidenceIds: ["e1"], edited: false },
        { id: "s0b1", text: "Worked in a team of 3 to analyse a business case.", evidenceIds: ["e2", "e3"], edited: false },
      ],
    },
    {
      id: "s1",
      heading: "OPERATIONS & STAKEHOLDER SUPPORT",
      bullets: [
        { id: "s1b0", text: "Supported 50+ international students per shift.", evidenceIds: ["e4"], edited: true },
      ],
    },
  ],
};

/*
 * The encoder has to keep producing exactly what the drafting route built
 * inline, because resume_draft is what the ATS reader scores, what the copy
 * button copies, and what every version already saved looks like.
 */
describe("renderResumeText", () => {
  it("writes the format the stored text column has always had", () => {
    expect(renderResumeText(document)).toBe(
      [
        "Bharani Kumar K — Business Analyst",
        "",
        "PROFESSIONAL SUMMARY",
        "Analyst with consulting delivery experience across retail and financial services.",
        "",
        "CLIENT CONSULTING & STRATEGIC PROJECTS",
        "• Delivered an Implementation Roadmap for an AI-assisted solution.",
        "• Worked in a team of 3 to analyse a business case.",
        "",
        "OPERATIONS & STAKEHOLDER SUPPORT",
        "• Supported 50+ international students per shift.",
      ].join("\n"),
    );
  });

  it("upper-cases headings and marks every bullet, whatever was typed in", () => {
    const text = renderResumeText({
      template: "classic",
      headline: "A",
      summary: "B",
      sections: [{ id: "s0", heading: "Client work", bullets: [{ id: "s0b0", text: "  Did a thing.  ", evidenceIds: [], edited: false }] }],
    });
    expect(text).toContain("CLIENT WORK");
    expect(text).toContain("• Did a thing.");
  });
});

/*
 * The decoder is what makes every draft already saved editable, rather than
 * only the ones generated after the structure started being kept. It reverses
 * a format we wrote ourselves, so the round trip is a test, not a hope.
 */
describe("contentFromText", () => {
  it("round-trips a document through the text column", () => {
    const recovered = contentFromText(renderResumeText(document));

    expect(recovered.headline).toBe(document.headline);
    expect(recovered.summary).toBe(document.summary);
    expect(recovered.sections.map((section) => section.heading)).toEqual([
      "CLIENT CONSULTING & STRATEGIC PROJECTS",
      "OPERATIONS & STAKEHOLDER SUPPORT",
    ]);
    expect(recovered.sections.flatMap((section) => section.bullets.map((bullet) => bullet.text))).toEqual(
      document.sections.flatMap((section) => section.bullets.map((bullet) => bullet.text)),
    );
  });

  it("re-encodes to exactly the text it was read from", () => {
    const text = renderResumeText(document);
    expect(renderResumeText(contentFromText(text))).toBe(text);
  });

  it("claims no evidence for a line whose backing was never stored", () => {
    const recovered = contentFromText(renderResumeText(document));
    expect(evidenceIdsIn(recovered)).toEqual([]);
  });

  it("keeps a capitalised headline as the headline, not a section break", () => {
    const recovered = contentFromText("IT SERVICE TRANSFORMATION LEADER\n\nPROFESSIONAL SUMMARY\nTwenty years in IT.");
    expect(recovered.headline).toBe("IT SERVICE TRANSFORMATION LEADER");
    expect(recovered.summary).toBe("Twenty years in IT.");
    expect(recovered.sections).toEqual([]);
  });

  it("reads the hyphens and asterisks a pasted CV uses as bullets", () => {
    const recovered = contentFromText("Name\n\nEXPERIENCE\n- Did one thing.\n* Did another.");
    expect(recovered.sections[0].bullets.map((bullet) => bullet.text)).toEqual(["Did one thing.", "Did another."]);
  });

  it("keeps an unmarked line inside a section rather than dropping the words", () => {
    const recovered = contentFromText("Name\n\nEXPERIENCE\nRan the pilot end to end.");
    expect(recovered.sections[0].bullets.map((bullet) => bullet.text)).toEqual(["Ran the pilot end to end."]);
  });

  it("survives an empty or whitespace-only draft", () => {
    expect(hasContent(contentFromText(""))).toBe(false);
    expect(hasContent(contentFromText("   \n\n  "))).toBe(false);
  });
});

/*
 * Stored JSON, normalised rather than cast. A field added to ResumeContent
 * later does not exist on a row written before it, and `as ResumeContent`
 * would satisfy the compiler and do nothing at runtime.
 */
describe("parseResumeContent", () => {
  it("reads a stored document back", () => {
    const parsed = parseResumeContent(JSON.parse(JSON.stringify(document)));
    expect(parsed).not.toBeNull();
    expect(parsed?.sections[0].bullets[0].evidenceIds).toEqual(["e1"]);
    expect(parsed?.sections[1].bullets[0].edited).toBe(true);
  });

  it("fills what a row written before a field cannot have", () => {
    const parsed = parseResumeContent({
      headline: "A",
      summary: "B",
      sections: [{ heading: "WORK", bullets: [{ text: "Did a thing." }] }],
    });
    expect(parsed?.sections[0].bullets[0].evidenceIds).toEqual([]);
    expect(parsed?.sections[0].bullets[0].edited).toBe(false);
    /* Ids are derived from position when the row never carried them. */
    expect(parsed?.sections[0].id).toBe("s0");
    expect(parsed?.sections[0].bullets[0].id).toBe("s0b0");
  });

  it("returns null for anything that is not a usable document", () => {
    for (const stored of [null, undefined, {}, [], "nonsense", 42, { sections: [] }]) {
      expect(parseResumeContent(stored)).toBeNull();
    }
  });

  it("drops entries of the wrong type rather than rendering them empty", () => {
    const parsed = parseResumeContent({
      headline: 7,
      summary: "B",
      sections: [
        { heading: "WORK", bullets: [{ text: "Kept." }, { text: "   " }, null, 42] },
        null,
        { heading: "  ", bullets: [] },
      ],
    });
    expect(parsed?.headline).toBe("");
    expect(parsed?.sections).toHaveLength(1);
    expect(parsed?.sections[0].bullets.map((bullet) => bullet.text)).toEqual(["Kept."]);
  });
});

describe("resumeContentOf", () => {
  it("prefers stored structure, because only it carries the evidence ids", () => {
    const content = resumeContentOf(document, "something else entirely");
    expect(content?.sections[0].bullets[0].evidenceIds).toEqual(["e1"]);
  });

  it("falls back to the text column, so a draft saved before structure still opens", () => {
    const content = resumeContentOf(null, renderResumeText(document));
    expect(content?.headline).toBe(document.headline);
    expect(content?.sections).toHaveLength(2);
  });

  it("is null when there is neither, so the caller shows an empty state not a blank page", () => {
    expect(resumeContentOf(null, null)).toBeNull();
    expect(resumeContentOf({}, "  ")).toBeNull();
  });
});

describe("evidenceIdsIn", () => {
  it("de-duplicates across every bullet", () => {
    expect(evidenceIdsIn(document)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(evidenceIdsIn(emptyContent())).toEqual([]);
  });
});
