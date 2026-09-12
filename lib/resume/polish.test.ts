import { describe, expect, it } from "vitest";
import { acceptRepairs, linesNeedingRepair, remainingFaults } from "./polish";

const line = (id: string, text: string) => ({ id, text });

describe("which lines go back to the model", () => {
  it("sends only the ones that broke a rule", () => {
    const needing = linesNeedingRepair([
      line("a", "Cut incident volume across four business units"),
      line("b", "Responsible for vendor management"),
    ]);
    expect(needing.map((entry) => entry.id)).toEqual(["b"]);
  });

  /*
   * Grouped by line, not listed by fault: a line with three problems needs one
   * rewrite that solves all three. Sent as three repairs it comes back three
   * different ways.
   */
  it("gives a line every fault found in it, at once", () => {
    const needing = linesNeedingRepair([line("a", "Responsible for a detail-oriented review that was delivered by my team")]);
    expect(needing).toHaveLength(1);
    expect(needing[0].faults.length).toBeGreaterThan(2);
  });

  it("sends nothing when the draft is already clean", () => {
    expect(linesNeedingRepair([line("a", "Led the migration of 14 applications")])).toEqual([]);
  });

  it("survives an empty draft", () => {
    expect(linesNeedingRepair([])).toEqual([]);
  });
});

describe("which repairs are taken", () => {
  const original = [line("a", "Responsible for vendor management across three countries")];

  it("takes a repair that actually fixes the fault", () => {
    const result = acceptRepairs(original, [line("a", "Negotiated vendor contracts across three countries")]);
    expect(result.accepted).toBe(1);
    expect(result.lines[0].text).toBe("Negotiated vendor contracts across three countries");
  });

  /*
   * The hard rule. A repair may only carry figures the line already had —
   * this pass runs with nobody watching, so a plausible invented number would
   * go straight onto a résumé.
   */
  it("refuses a repair that invented a figure", () => {
    const result = acceptRepairs(original, [line("a", "Negotiated vendor contracts across three countries, cutting spend 22%")]);
    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.lines[0].text).toBe(original[0].text);
  });

  it("keeps a figure that was already there", () => {
    const result = acceptRepairs(
      [line("a", "Responsible for 14 applications")],
      [line("a", "Migrated 14 applications")],
    );
    expect(result.accepted).toBe(1);
  });

  /*
   * A model asked to fix a weak opener can hand back a line with a new
   * problem. Taking every repair on faith would let the second pass make the
   * résumé worse than the first one did.
   */
  it("refuses a repair that is no cleaner than what it replaces", () => {
    const result = acceptRepairs(original, [line("a", "Helped with vendor management across three countries")]);
    expect(result.accepted).toBe(0);
    expect(result.lines[0].text).toBe(original[0].text);
  });

  it("leaves a line the model did not return", () => {
    const result = acceptRepairs(original, []);
    expect(result.lines[0].text).toBe(original[0].text);
    expect(result.accepted).toBe(0);
  });

  it("leaves a line returned unchanged, and does not count it", () => {
    const result = acceptRepairs(original, [line("a", original[0].text)]);
    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(0);
  });

  it("keeps every line, in order, whatever was accepted", () => {
    const many = [line("a", "Responsible for delivery"), line("b", "Led the migration of 14 applications"), line("c", "Helped with reporting")];
    const result = acceptRepairs(many, [line("a", "Delivered the programme")]);
    expect(result.lines.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });
});

/*
 * What survives two passes is usually a line where the checker is wrong — a
 * bullet that needs the passive voice because the actor is not the person.
 * Those are reported to the reader rather than forced.
 */
describe("what is left for the reader", () => {
  it("names what is still wrong after repair", () => {
    expect(remainingFaults([line("a", "Responsible for delivery")])).toHaveLength(1);
  });

  it("says nothing about a clean draft", () => {
    expect(remainingFaults([line("a", "Led the migration of 14 applications")])).toEqual([]);
  });
});
