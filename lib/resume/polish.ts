import { reviewWriting, RESUME_WRITING_RULES, type WritingFinding } from "@/lib/resume/writing";

/*
 * Holding the model to the standard it was given.
 *
 * The writing rules were stated in every drafting prompt and checked nowhere.
 * The generator wrote a draft, the draft was saved, and the panel afterwards
 * told the person which lines broke rules the model had already been handed.
 * That is the wrong way round: a rule the machine can check is a rule the
 * machine should fix before anybody reads it.
 *
 * So a draft is reviewed against the same rules that produced it, and the lines
 * that failed go back with the specific fault named. Not "improve this" — a
 * model asked to improve a line it thinks is fine will rewrite it into
 * something worse. "This opens on 'helped', which reports being near the work"
 * is a defect report, and a defect report is repairable.
 *
 * Two passes, never more. A third would be a model arguing with a regular
 * expression, and the lines that survive two rounds are the ones where the
 * checker is wrong — a bullet that genuinely needs the passive voice because
 * the actor is not the person, say. Those are kept as written and reported to
 * the reader instead, which is what the panel was always for.
 */

export const REPAIR_RULES = [
  "You are repairing specific faults in résumé lines you wrote. Each line comes with exactly what is wrong with it.",
  "Fix only the fault named. Do not rewrite a line for taste, do not merge lines, do not add a line and do not drop one.",
  "Every fact, figure, employer, tool and outcome in your repair must already be in the line you were given. You have no other source, and inventing one here would put an unverifiable claim on somebody's résumé.",
  "If a line cannot be repaired without inventing something, return it unchanged. An honest weak line beats a fluent false one.",
  RESUME_WRITING_RULES,
  "Return one repair per line you were given, in the same order, each carrying the same id.",
].join(" ");

export const REPAIR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "text"],
        properties: {
          id: { type: "string" },
          text: { type: "string" },
        },
      },
    },
  },
};

export type RepairableLine = { id: string; text: string };

/**
 * The lines worth sending back, each with every fault found in it.
 *
 * Grouped by line rather than listed by fault, because a line with three
 * problems needs one rewrite that solves all three — sent as three separate
 * repairs it would come back three different ways.
 */
export function linesNeedingRepair(lines: RepairableLine[]): Array<{ id: string; text: string; faults: string[] }> {
  const findings = reviewWriting(lines.map((line) => line.text));

  const byIndex = new Map<number, string[]>();
  for (const finding of findings) {
    byIndex.set(finding.index, [...(byIndex.get(finding.index) ?? []), finding.detail]);
  }

  return [...byIndex.entries()]
    .map(([index, faults]) => ({ id: lines[index].id, text: lines[index].text, faults }))
    .filter((entry) => entry.id !== undefined);
}

/**
 * Which repairs to keep.
 *
 * A repair is taken only when it is genuinely cleaner than what it replaces.
 * A model asked to fix a weak opener can hand back a line with a new problem,
 * or one that invents a figure, and taking every repair on faith would let a
 * second pass make a résumé worse than the first one did.
 *
 * Numbers are the hard rule rather than a preference: a repair may only contain
 * figures that were already in the line. This is the same guard the single-line
 * rewrite uses, applied to the pass that runs without anybody watching.
 */
export function acceptRepairs(
  original: RepairableLine[],
  repairs: RepairableLine[],
): { lines: RepairableLine[]; accepted: number; rejected: number } {
  const repairById = new Map(repairs.map((repair) => [repair.id, repair.text.trim()]));

  let accepted = 0;
  let rejected = 0;

  const lines = original.map((line) => {
    const repaired = repairById.get(line.id);
    if (!repaired || repaired === line.text.trim()) return line;

    /* A figure that was not in the original is an invention, whatever it fixed. */
    const before = new Set(line.text.match(/\d+(?:[.,]\d+)*/g) ?? []);
    const invented = (repaired.match(/\d+(?:[.,]\d+)*/g) ?? []).filter((number) => !before.has(number));
    if (invented.length) {
      rejected += 1;
      return line;
    }

    /* Cleaner, or it does not go in. */
    const wasWrong = reviewWriting([line.text]).length;
    const nowWrong = reviewWriting([repaired]).length;
    if (nowWrong >= wasWrong) {
      rejected += 1;
      return line;
    }

    accepted += 1;
    return { id: line.id, text: repaired };
  });

  return { lines, accepted, rejected };
}

/** What is still wrong after the repair pass, for the reader rather than the model. */
export function remainingFaults(lines: RepairableLine[]): WritingFinding[] {
  return reviewWriting(lines.map((line) => line.text));
}
