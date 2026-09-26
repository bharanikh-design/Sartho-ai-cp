import { describe, expect, it } from "vitest";
import { isCalendarDay, normaliseNextAction } from "@/lib/applications/next-action";

/*
 * The column these feed has been in the schema since the beginning and the
 * Command Centre has always read it; nothing could ever write one. So there is
 * no prior behaviour to protect here — these assert the rules that decide what
 * is worth putting on somebody's dashboard.
 */

describe("isCalendarDay", () => {
  it("accepts a real day", () => {
    expect(isCalendarDay("2026-09-26")).toBe(true);
    expect(isCalendarDay("2024-02-29"), "leap day in a leap year").toBe(true);
  });

  it("rejects days that match the pattern and are not dates", () => {
    /*
     * The reason this is a round-trip and not a regex. Every one of these
     * passes /^\d{4}-\d{2}-\d{2}$/, and Date rolls each of them forward into
     * some other day rather than refusing — so a regex alone would have stored
     * "31 February" as 3 March without telling anybody.
     */
    expect(isCalendarDay("2026-02-31")).toBe(false);
    expect(isCalendarDay("2026-13-01")).toBe(false);
    expect(isCalendarDay("2026-00-10")).toBe(false);
    expect(isCalendarDay("2026-04-31")).toBe(false);
    expect(isCalendarDay("2025-02-29"), "leap day in a common year").toBe(false);
  });

  it("rejects anything that is not a plain calendar day", () => {
    expect(isCalendarDay("")).toBe(false);
    expect(isCalendarDay("26-09-2026")).toBe(false);
    expect(isCalendarDay("2026-9-6")).toBe(false);
    expect(isCalendarDay("2026-09-26T10:00:00Z"), "a timestamp is not a date column").toBe(false);
    expect(isCalendarDay("tomorrow")).toBe(false);
  });
});

describe("normaliseNextAction", () => {
  it("keeps an action and its day", () => {
    expect(normaliseNextAction("Follow up with the hiring manager", "2026-10-02")).toEqual({
      nextAction: "Follow up with the hiring manager",
      nextActionDate: "2026-10-02",
    });
  });

  it("trims, because a leading space is not a different action", () => {
    expect(normaliseNextAction("  Call the recruiter  ", null).nextAction).toBe("Call the recruiter");
  });

  it("treats whitespace as clearing it", () => {
    /* Otherwise the dashboard leads with a blank headline nobody can act on. */
    expect(normaliseNextAction("   ", "2026-10-02")).toEqual({ nextAction: null, nextActionDate: null });
    expect(normaliseNextAction(null, null)).toEqual({ nextAction: null, nextActionDate: null });
  });

  it("drops a date that has no action attached to it", () => {
    /* A deadline for nothing. Clearing the action clears the day with it. */
    expect(normaliseNextAction(null, "2026-10-02")).toEqual({ nextAction: null, nextActionDate: null });
  });

  it("keeps the action when the date is unusable rather than losing both", () => {
    /*
     * The route rejects a malformed date before this runs, but a row written
     * by an older shape can still reach it. Losing the person's sentence
     * because the day beside it was bad would be the worse failure.
     */
    expect(normaliseNextAction("Chase the referral", "2026-02-31")).toEqual({
      nextAction: "Chase the referral",
      nextActionDate: null,
    });
    expect(normaliseNextAction("Chase the referral", "")).toEqual({
      nextAction: "Chase the referral",
      nextActionDate: null,
    });
  });
});
