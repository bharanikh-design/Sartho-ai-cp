import { describe, expect, it } from "vitest";
import { emptyContent, type ResumeContent } from "./content";
import { resumeDocxBuffer } from "./docx";
import { parseFidelity } from "./parse-check";

/*
 * The round trip, for real: the Word file is built and read back with the
 * library the import uses, and every fact must come back in order.
 */
const document: ResumeContent = {
  ...emptyContent(),
  template: "engineering",
  name: "Bharani Kumar H",
  targetRole: "Programme Lead, Vehicle Software",
  contact: { email: "b@example.com", phone: "+44 7000 000000", location: "Coventry, UK", linkedin: "", website: "" },
  summary: "Programme leader across vehicle software platforms.",
  roles: [
    { id: "r0", title: "Head of EUC Engineering", employer: "Barclays", location: "London", start: "Mar 2019", end: "", current: true, bullets: [{ id: "r0b0", text: "Cut major incident volume by 40% across a 60,000 device estate.", evidenceIds: [], edited: false }] },
    { id: "r1", title: "Service Transition Lead", employer: "HSBC", location: "", start: "2015", end: "2019", current: false, bullets: [{ id: "r1b0", text: "Consolidated four regional service desks into one operation.", evidenceIds: [], edited: false }] },
  ],
  sections: [{ id: "s0", heading: "Programmes", bullets: [{ id: "s0b0", text: "Launched the EV platform software across two plants.", evidenceIds: [], edited: false }] }],
  skills: ["ITSM", "Vendor management"],
  skillGroups: [{ id: "sg0", name: "Standards", skills: ["ISO 26262", "ASPICE", "IATF 16949"] }],
  certifications: [{ id: "c0", name: "Functional Safety Engineer", issuer: "TÜV SÜD", year: "2023" }],
  education: [{ id: "ed0", qualification: "BSc Computer Science", institution: "University of Madras", year: "2004" }],
};

describe("parseFidelity", () => {
  it("finds every fact in the Word file, in order", async () => {
    const bytes = await resumeDocxBuffer(document);
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: bytes });

    const result = parseFidelity(document, value);
    expect(result.items.filter((item) => !item.found)).toEqual([]);
    expect(result.orderPreserved).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.items.map((item) => item.label)).toEqual(expect.arrayContaining(["Role 1 dates", "Certification", "Section heading", "Skill"]));
  });

  it("reports what a lossy file dropped, and roles that came back out of order", () => {
    const lossy = "Bharani Kumar H\nHSBC Service Transition Lead 2015 – 2019\nBarclays Head of EUC Engineering\nITSM";
    const result = parseFidelity(document, lossy);
    expect(result.ok).toBe(false);
    expect(result.orderPreserved).toBe(false);
    const missing = result.items.filter((item) => !item.found).map((item) => item.label);
    expect(missing).toEqual(expect.arrayContaining(["Email", "Role 1 dates", "Certification", "Qualification"]));
  });

  it("is not thrown by dashes and line wraps a PDF reader introduces", () => {
    const wrapped = "Bharani Kumar H\nb@example.com · +44 7000 000000\nHead of EUC\nEngineering, Barclays · London Mar 2019 - Present\nCut major incident volume by 40% across a\n60,000 device estate.";
    const result = parseFidelity(document, wrapped);
    expect(result.items.find((item) => item.label === "Role 1 title")?.found).toBe(true);
    expect(result.items.find((item) => item.label === "Role 1 dates")?.found).toBe(true);
    expect(result.items.find((item) => item.label === "Role 1 first line")?.found).toBe(true);
  });
});
