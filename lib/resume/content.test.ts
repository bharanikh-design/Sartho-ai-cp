import { describe, expect, it } from "vitest";
import {
  contentFromText,
  emptyContact,
  emptyContent,
  evidenceIdsIn,
  hasContent,
  parseResumeContent,
  contactLine,
  headlineOf,
  renderResumeText,
  resumeContentOf,
  roleDates,
  roleWhere,
  splitHeadline,
  type ResumeContent,
} from "@/lib/resume/content";

const document: ResumeContent = {
  template: "classic",
  name: "Bharani Kumar K",
  targetRole: "Business Analyst",
  contact: emptyContact(),
  summary: "Analyst with consulting delivery experience across retail and financial services.",
  roles: [],
  skills: [],
  education: [],
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
      ...document,
      name: "A",
      targetRole: "",
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

    expect(recovered.name).toBe(document.name);
    expect(recovered.targetRole).toBe(document.targetRole);
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
    expect(recovered.name).toBe("IT SERVICE TRANSFORMATION LEADER");
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
    expect(parsed?.name).toBe("");
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
    expect(content?.name).toBe(document.name);
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

/*
 * The document a template can actually be built from.
 *
 * Six templates could only ever be six typefaces because a section was a
 * heading and a flat list of bullets — there was no employer, no job title and
 * no date anywhere in the document, so there was nothing to lay out. These are
 * the fields that changed that.
 */
describe("the structured document", () => {
  const structured: ResumeContent = {
    ...emptyContent(),
    name: "Priya Raman",
    targetRole: "Financial Analyst",
    contact: { email: "priya@example.com", phone: "+61 400 000 000", location: "Melbourne", linkedin: "", website: "" },
    summary: "Three years in FP&A.",
    roles: [{
      id: "r0",
      title: "Senior Financial Analyst",
      employer: "Deloitte",
      location: "Sydney",
      start: "Jan 2022",
      end: "",
      current: true,
      bullets: [{ id: "r0b0", text: "Cut the monthly close from nine days to five.", evidenceIds: ["e9"], edited: false }],
    }],
    skills: ["Excel", "SQL"],
    education: [{ id: "ed0", qualification: "BCom (Finance)", institution: "University of Melbourne", year: "2022" }],
  };

  it("keeps the name and the target role apart", () => {
    expect(headlineOf(structured)).toBe("Priya Raman — Financial Analyst");
    /* With no role, no dangling separator. */
    expect(headlineOf({ name: "Priya Raman", targetRole: "" })).toBe("Priya Raman");
  });

  /*
   * With no separator the whole line is the name, never the role. Backwards,
   * this would put somebody's job title where their name belongs on every
   * template at once — and a missing target role is invisible where a missing
   * name is the first thing a reader notices.
   */
  it("splits a stored headline back, and guesses a name rather than a role", () => {
    expect(splitHeadline("Priya Raman — Financial Analyst")).toEqual({ name: "Priya Raman", targetRole: "Financial Analyst" });
    expect(splitHeadline("Priya Raman | Financial Analyst")).toEqual({ name: "Priya Raman", targetRole: "Financial Analyst" });
    expect(splitHeadline("IT SERVICE TRANSFORMATION LEADER")).toEqual({ name: "IT SERVICE TRANSFORMATION LEADER", targetRole: "" });
    expect(splitHeadline("   ")).toEqual({ name: "", targetRole: "" });
  });

  it("prints only the halves of a date range that exist", () => {
    expect(roleDates({ start: "Jan 2022", end: "Dec 2024", current: false })).toBe("Jan 2022 – Dec 2024");
    /* Current wins over a stale end date rather than printing both. */
    expect(roleDates({ start: "Jan 2022", end: "Dec 2024", current: true })).toBe("Jan 2022 – Present");
    expect(roleDates({ start: "2019", end: "", current: false })).toBe("2019");
    expect(roleDates({ start: "", end: "", current: false })).toBe("");
  });

  it("omits a contact field nobody filled in rather than printing an empty gap", () => {
    expect(contactLine(structured.contact)).toBe("priya@example.com · +61 400 000 000 · Melbourne");
    expect(contactLine(emptyContact())).toBe("");
    expect(roleWhere({ employer: "Deloitte", location: "" })).toBe("Deloitte");
  });

  it("writes every block into the text the ATS reader scores", () => {
    const text = renderResumeText(structured);
    expect(text).toContain("Priya Raman — Financial Analyst");
    expect(text).toContain("priya@example.com · +61 400 000 000 · Melbourne");
    expect(text).toContain("EXPERIENCE");
    expect(text).toContain("Senior Financial Analyst, Deloitte · Sydney");
    expect(text).toContain("Jan 2022 – Present");
    expect(text).toContain("SKILLS");
    expect(text).toContain("Excel · SQL");
    expect(text).toContain("EDUCATION");
    expect(text).toContain("BCom (Finance), University of Melbourne — 2022");
  });

  /*
   * The guarantee that made this change safe to ship. Every draft already in
   * the database has no contact block, no roles, no skills and no education —
   * and rewriting the stored text of versions nobody has touched in months
   * would change what the ATS reader scores for them.
   */
  it("writes a document from before any of this existed byte-for-byte as it always was", () => {
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

  it("upgrades a row that only ever had a headline", () => {
    const parsed = parseResumeContent({
      headline: "Priya Raman — Financial Analyst",
      summary: "B",
      sections: [{ heading: "WORK", bullets: [{ text: "Did a thing." }] }],
    });
    expect(parsed?.name).toBe("Priya Raman");
    expect(parsed?.targetRole).toBe("Financial Analyst");
    /* Nothing is invented for the fields that row could not have carried. */
    expect(parsed?.contact).toEqual(emptyContact());
    expect(parsed?.roles).toEqual([]);
    expect(parsed?.skills).toEqual([]);
    expect(parsed?.education).toEqual([]);
  });

  it("reads roles, skills and education back out of stored JSON", () => {
    const parsed = parseResumeContent(JSON.parse(JSON.stringify(structured)));
    expect(parsed?.roles[0].employer).toBe("Deloitte");
    expect(parsed?.roles[0].current).toBe(true);
    expect(parsed?.roles[0].bullets[0].evidenceIds).toEqual(["e9"]);
    expect(parsed?.skills).toEqual(["Excel", "SQL"]);
    expect(parsed?.education[0].institution).toBe("University of Melbourne");
  });

  it("drops a role that is not one, and junk inside the ones that are", () => {
    const parsed = parseResumeContent({
      name: "A",
      roles: [
        { title: "Kept", employer: "X", bullets: [{ text: "Real." }, { text: "  " }, null] },
        { title: "", employer: "", bullets: [] },
        null,
        42,
      ],
      skills: ["Excel", "  ", 7, null],
      education: [{ qualification: "", institution: "" }, { qualification: "BCom" }],
    });
    expect(parsed?.roles).toHaveLength(1);
    expect(parsed?.roles[0].bullets.map((bullet) => bullet.text)).toEqual(["Real."]);
    expect(parsed?.skills).toEqual(["Excel"]);
    expect(parsed?.education).toHaveLength(1);
  });

  /*
   * Missing these would drop the backing for most of a modern draft — the
   * bullets now live under roles — and the version would be stored claiming
   * evidence for nothing.
   */
  it("counts the evidence under a role, not only under a section", () => {
    expect(evidenceIdsIn(structured)).toEqual(["e9"]);
    expect(evidenceIdsIn({ ...structured, sections: document.sections })).toEqual(["e9", "e1", "e2", "e3", "e4"]);
  });

  it("knows a document carrying only roles is not empty", () => {
    expect(hasContent({ ...emptyContent(), roles: structured.roles })).toBe(true);
    expect(hasContent({ ...emptyContent(), skills: ["Excel"] })).toBe(true);
    expect(hasContent(emptyContent())).toBe(false);
  });
});
