import { describe, expect, it } from "vitest";
import { alreadyEarned, nextCelebration } from "@/lib/journey/celebration";

const steps = (complete: string[]) =>
  ["resume", "direction", "search"].map((id) => ({ id, complete: complete.includes(id) }));

describe("nextCelebration", () => {
  it("celebrates a step the moment it is finished", () => {
    const celebration = nextCelebration(steps(["resume"]), []);
    expect(celebration?.id).toBe("resume");
    expect(celebration?.badge).toBe("Résumé uploaded");
    expect(celebration?.ctaHref).toBe("/career-direction");
  });

  /*
   * The rule that keeps this from becoming the confetti every product throws
   * at you. Seen once is seen for ever; a card that reappears on every page
   * load teaches people to dismiss it without reading.
   */
  it("never celebrates the same step twice", () => {
    expect(nextCelebration(steps(["resume"]), ["resume"])).toBeNull();
  });

  it("says nothing when nothing has been finished", () => {
    expect(nextCelebration(steps([]), [])).toBeNull();
  });

  /*
   * Somebody who finishes two steps between visits is congratulated on the
   * first, then the second next time — not shown two cards at once, and not
   * silently skipped past the earlier one.
   */
  it("takes the earliest uncelebrated step, one at a time", () => {
    const first = nextCelebration(steps(["resume", "direction"]), []);
    expect(first?.id).toBe("resume");

    const second = nextCelebration(steps(["resume", "direction"]), ["resume"]);
    expect(second?.id).toBe("direction");

    expect(nextCelebration(steps(["resume", "direction"]), ["resume", "direction"])).toBeNull();
  });

  it("ignores a step nobody has written copy for", () => {
    expect(nextCelebration([{ id: "invented", complete: true }], [])).toBeNull();
  });

  it("survives a status payload of the wrong shape", () => {
    expect(nextCelebration([], [])).toBeNull();
    expect(nextCelebration(steps(["search"]), [])).not.toBeNull();
  });

  /*
   * Every celebration has to name what the step actually bought. "One step
   * closer" alone is a greetings card; the specific consequence is the part
   * worth reading and the part that makes the next step obvious.
   */
  it("always carries a concrete detail and somewhere to go next", () => {
    for (const id of ["resume", "direction", "search"]) {
      const celebration = nextCelebration(steps([id]), []);
      expect(celebration).not.toBeNull();
      expect(celebration!.detail.length).toBeGreaterThan(40);
      expect(celebration!.ctaHref.startsWith("/")).toBe(true);
      expect(celebration!.ctaLabel.length).toBeGreaterThan(3);
    }
  });
});

/*
 * The day this ships, everybody already using Sartho has finished every step.
 * Congratulating them on work done in June would be absurd.
 */
describe("alreadyEarned", () => {
  it("marks the steps somebody had finished before this existed", () => {
    expect(alreadyEarned(steps(["resume", "direction"]))).toEqual(["resume", "direction"]);
  });

  it("claims nothing for somebody who has just arrived", () => {
    expect(alreadyEarned(steps([]))).toEqual([]);
  });

  it("silences exactly the celebrations that would have been wrong", () => {
    const existing = steps(["resume", "direction", "search"]);
    expect(nextCelebration(existing, alreadyEarned(existing))).toBeNull();
  });
});
