import { describe, expect, it } from "vitest";
import { MAX_RESUME_SKILLS, skillEvidenceCounts, skillsForRole, skillsFromEvidence } from "./skills";

const item = (claim: string, domains: string[] = []) => ({ claim, context: null, metrics: null, domains });

describe("skills read off the evidence", () => {
  it("finds what the wording demonstrates", () => {
    const skills = skillsFromEvidence([item("Led sprint planning and backlog refinement for three squads")]);
    expect(skills).toContain("Agile delivery");
  });

  /*
   * The person's own domain tags go through the same vocabulary, so a tag and
   * the wording that means the same thing land on one capability rather than
   * two near-duplicates sitting side by side on the résumé.
   */
  it("folds a domain tag into the same capability as the words", () => {
    const counts = skillEvidenceCounts([item("Ran client engagement management", ["Consulting"])]);
    expect(counts.get("Consulting")).toBe(1);
  });

  it("counts a capability once per evidence item, not once per phrase", () => {
    const counts = skillEvidenceCounts([item("Agile delivery with scrum, sprints, backlog and stand ups")]);
    expect(counts.get("Agile delivery")).toBe(1);
  });

  /* The strongest thing somebody can demonstrate leads. */
  it("orders by how much evidence backs each", () => {
    const skills = skillsFromEvidence([
      item("Business analysis and requirements gathering"),
      item("Business requirements document and gap analysis"),
      item("Sprint planning"),
    ]);
    expect(skills[0]).toBe("Business analysis");
  });

  /*
   * A document that reshuffles itself between builds is one nobody can trust,
   * so ties break alphabetically rather than by whichever evidence row the
   * database happened to return first.
   */
  it("produces the same résumé from the same evidence", () => {
    const evidence = [item("Sprint planning"), item("Stakeholder engagement")];
    expect(skillsFromEvidence(evidence)).toEqual(skillsFromEvidence([...evidence].reverse()));
  });

  it("keeps the line scannable", () => {
    const many = Array.from({ length: 40 }, (_, index) => item(`Business analysis ${index}`));
    expect(skillsFromEvidence(many).length).toBeLessThanOrEqual(MAX_RESUME_SKILLS);
  });

  it("says nothing when there is nothing to say", () => {
    expect(skillsFromEvidence([])).toEqual([]);
    expect(skillsFromEvidence([item("")])).toEqual([]);
  });
});

/*
 * Tailoring is choosing which true things to lead with. It is not promoting a
 * requirement somebody cannot back into their skills line, which is the
 * difference between this and keyword stuffing.
 */
describe("skills ordered for one role", () => {
  const evidence = [
    item("Business analysis and requirements gathering"),
    item("Business requirements and gap analysis"),
    item("Business process mapping"),
    item("Ran sprint planning"),
  ];

  it("leads with what the role asks for and the person can evidence", () => {
    const skills = skillsForRole(evidence, ["Agile delivery"]);
    expect(skills[0]).toBe("Agile delivery");
  });

  it("never invents a skill the role wants but the evidence does not back", () => {
    const skills = skillsForRole(evidence, ["Cyber security", "Machine learning"]);
    expect(skills).not.toContain("Cyber security");
    expect(skills).not.toContain("Machine learning");
  });

  it("keeps everything else, ordered by evidence, behind what the role wants", () => {
    const skills = skillsForRole(evidence, ["Agile delivery"]);
    expect(skills).toContain("Business analysis");
    expect(skills.indexOf("Agile delivery")).toBeLessThan(skills.indexOf("Business analysis"));
  });

  it("falls back to plain evidence order when the role asked for nothing", () => {
    expect(skillsForRole(evidence, [])).toEqual(skillsFromEvidence(evidence));
  });

  it("is stable for the same role and evidence", () => {
    expect(skillsForRole(evidence, ["Agile delivery"])).toEqual(skillsForRole(evidence, ["Agile delivery"]));
  });
});
