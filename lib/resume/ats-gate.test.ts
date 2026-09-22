import { describe, expect, it } from "vitest";
import { emptyContent, type ResumeContent } from "./content";
import { dateParses, gateChecks, mentions, monthIndex, termVariants, titleAlignment } from "./ats-gate";

const NOW = new Date("2026-09-01T00:00:00Z");

function doc(overrides: Partial<ResumeContent> = {}): ResumeContent {
  return {
    ...emptyContent(),
    name: "Bharani Kumar H",
    contact: { email: "b@example.com", phone: "+44 7000 000000", location: "London, UK", linkedin: "", website: "" },
    summary: "Technology leader.",
    roles: [
      { id: "r0", title: "Head of EUC Engineering", employer: "Barclays", location: "", start: "Mar 2019", end: "", current: true, bullets: [{ id: "r0b0", text: "Cut incidents by 40% with Intune across the estate.", evidenceIds: [], edited: false }] },
      { id: "r1", title: "Service Transition Lead", employer: "HSBC", location: "", start: "2015", end: "2019", current: false, bullets: [] },
    ],
    skills: ["ITSM", "Kubernetes"],
    education: [{ id: "ed0", qualification: "BSc Computer Science", institution: "Madras", year: "2004" }],
    ...overrides,
  };
}

describe("monthIndex and dateParses", () => {
  it("reads years, month names, numeric months and 'present'", () => {
    expect(monthIndex("2019")).toBe(2019 * 12);
    expect(monthIndex("Mar 2021")).toBe(2021 * 12 + 2);
    expect(monthIndex("03/2021")).toBe(2021 * 12 + 2);
    expect(monthIndex("Present", NOW)).toBe(2026 * 12 + 8);
    expect(monthIndex("Spring")).toBeNull();
    expect(dateParses("Jan 2022")).toBe(true);
    expect(dateParses("last year")).toBe(false);
  });
});

describe("gateChecks", () => {
  it("passes a reachable, dated, ordered résumé with standard sections", () => {
    const result = gateChecks(doc(), NOW);
    expect(result.passes).toBe(true);
    expect(result.checks.map((check) => `${check.label}:${check.state}`)).toEqual([
      "Reachable:pass", "Location stated:pass", "Dated employment:pass", "Dates a parser can read:pass",
      "Newest role first:pass", "No unexplained gaps:pass", "Standard sections:pass",
    ]);
  });

  it("fails when nobody can reply, and warns when only one channel is given", () => {
    expect(gateChecks(doc({ contact: { email: "", phone: "", location: "London", linkedin: "", website: "" } }), NOW).checks[0].state).toBe("fail");
    expect(gateChecks(doc({ contact: { email: "b@example.com", phone: "", location: "London", linkedin: "", website: "" } }), NOW).checks[0].state).toBe("warn");
  });

  it("fails a date a parser cannot place and a history that runs oldest first", () => {
    const base = doc();
    const unparsed = gateChecks(doc({ roles: [{ ...base.roles[0], start: "a while ago" }, base.roles[1]] }), NOW);
    expect(unparsed.checks.find((check) => check.label === "Dates a parser can read")?.state).toBe("fail");
    const reversed = gateChecks(doc({ roles: [base.roles[1], base.roles[0]] }), NOW);
    expect(reversed.checks.find((check) => check.label === "Newest role first")?.state).toBe("fail");
    expect(reversed.passes).toBe(false);
  });

  it("warns on a gap of more than six months, and forgives January-to-January arithmetic on year-only dates", () => {
    const base = doc();
    const gapped = gateChecks(doc({ roles: [{ ...base.roles[0], start: "Mar 2021" }, { ...base.roles[1], end: "Jan 2020" }] }), NOW);
    expect(gapped.checks.find((check) => check.label === "No unexplained gaps")?.state).toBe("warn");
    const adjacent = gateChecks(doc({ roles: [{ ...base.roles[0], start: "2020" }, { ...base.roles[1], end: "2019" }] }), NOW);
    expect(adjacent.checks.find((check) => check.label === "No unexplained gaps")?.state).toBe("pass");
  });

  it("fails with no dated employment at all, and warns on a missing conventional section", () => {
    const none = gateChecks(doc({ roles: [] }), NOW);
    expect(none.checks.find((check) => check.label === "Dated employment")?.state).toBe("fail");
    const noSkills = gateChecks(doc({ skills: [], skillGroups: [] }), NOW);
    expect(noSkills.checks.find((check) => check.label === "Standard sections")?.state).toBe("warn");
    expect(noSkills.passes).toBe(true);
  });
});

describe("term variants", () => {
  it("matches the short forms people actually write", () => {
    expect(termVariants("Kubernetes")).toEqual(expect.arrayContaining(["kubernetes", "k8s"]));
    expect(mentions("Ran the K8s platform for 40 teams", "Kubernetes")).toBe(true);
    expect(mentions("Rolled out Intune to 42,000 devices", "Microsoft Intune")).toBe(true);
    expect(mentions("Owned the ITSM tooling", "IT service management")).toBe(true);
    expect(mentions("Built the CI/CD pipeline", "continuous integration")).toBe(true);
  });

  it("does not match a word inside another word", () => {
    expect(mentions("Journalist", "JS")).toBe(false);
    expect(mentions("Wrote JS for the front end", "JavaScript")).toBe(true);
  });
});

describe("titleAlignment", () => {
  it("ignores seniority words and matches on what the job is", () => {
    const result = titleAlignment(doc({ targetRole: "Senior Platform Engineer" }), "Platform Engineer II");
    expect(result.share).toBe(1);
  });

  it("reads the most recent role's title as well as the headline", () => {
    const result = titleAlignment(doc({ targetRole: "" }), "Head of End User Computing Engineering");
    expect(result.matched).toEqual(expect.arrayContaining(["euc", "engineering"].filter((token) => result.wanted.includes(token))));
    expect(result.share).toBeGreaterThan(0);
    const miss = titleAlignment(doc({ targetRole: "Pastry Chef" }), "Data Scientist");
    expect(miss.share).toBe(0);
  });
});
