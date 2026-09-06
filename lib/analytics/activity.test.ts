import { describe, expect, it } from "vitest";
import {
  HEARTBEAT_SECONDS,
  MAX_CREDITED_GAP_SECONDS,
  NEW_VISIT_GAP_SECONDS,
  accrueActivity,
  describeDuration,
  type ActivitySnapshot,
} from "@/lib/analytics/activity";

const start = new Date("2026-09-06T09:00:00.000Z");
const at = (secondsLater: number) => new Date(start.getTime() + secondsLater * 1000);

const snapshot = (overrides: Partial<ActivitySnapshot> = {}): ActivitySnapshot => ({
  firstSeenAt: start.toISOString(),
  lastSeenAt: start.toISOString(),
  activeSeconds: 0,
  visitCount: 1,
  ...overrides,
});

describe("accrueActivity", () => {
  it("records a first sighting without inventing time", () => {
    const next = accrueActivity(null, start);
    expect(next.activeSeconds).toBe(0);
    expect(next.visitCount).toBe(1);
    expect(next.firstSeenAt).toBe(start.toISOString());
    expect(next.lastSeenAt).toBe(start.toISOString());
  });

  it("credits an ordinary heartbeat in full", () => {
    const next = accrueActivity(snapshot(), at(HEARTBEAT_SECONDS));
    expect(next.activeSeconds).toBe(HEARTBEAT_SECONDS);
    expect(next.visitCount).toBe(1);
  });

  it("accumulates across a working session", () => {
    let state = accrueActivity(null, start);
    for (let beat = 1; beat <= 10; beat += 1) {
      state = accrueActivity(state, at(beat * HEARTBEAT_SECONDS));
    }
    expect(state.activeSeconds).toBe(10 * HEARTBEAT_SECONDS);
    expect(state.visitCount).toBe(1);
  });

  it("still credits a beat that arrived a little late", () => {
    const next = accrueActivity(snapshot(), at(MAX_CREDITED_GAP_SECONDS));
    expect(next.activeSeconds).toBe(MAX_CREDITED_GAP_SECONDS);
  });

  /*
   * The case the whole design exists for. A laptop closed at six and opened at
   * nine sends no heartbeats in between, so the first beat of the morning
   * arrives with a fifteen-hour gap. Crediting it would say somebody used
   * Sartho all night.
   */
  it("credits nothing for a laptop closed overnight", () => {
    const overnight = accrueActivity(snapshot({ activeSeconds: 600 }), at(15 * 60 * 60));
    expect(overnight.activeSeconds).toBe(600);
    /* And they are back, which is a second visit. */
    expect(overnight.visitCount).toBe(2);
    expect(overnight.lastSeenAt).toBe(at(15 * 60 * 60).toISOString());
  });

  it("counts a return as a new visit but a pause as the same one", () => {
    const sameVisit = accrueActivity(snapshot(), at(NEW_VISIT_GAP_SECONDS - 1));
    expect(sameVisit.visitCount).toBe(1);

    const returned = accrueActivity(snapshot(), at(NEW_VISIT_GAP_SECONDS + 1));
    expect(returned.visitCount).toBe(2);
  });

  it("credits nothing for a gap it cannot vouch for, even a short one", () => {
    /* Five minutes hidden is five minutes not observed, not 90 seconds of it. */
    const next = accrueActivity(snapshot({ activeSeconds: 300 }), at(5 * 60));
    expect(next.activeSeconds).toBe(300);
    expect(next.visitCount).toBe(1);
  });

  /*
   * Two requests can arrive out of order, and a stored timestamp can be
   * anything. A clock disagreement must never be able to reduce a number.
   */
  it("never lets a number go backwards", () => {
    const previous = snapshot({ activeSeconds: 900, lastSeenAt: at(600).toISOString() });
    const next = accrueActivity(previous, at(120));
    expect(next.activeSeconds).toBe(900);
    expect(next.lastSeenAt).toBe(at(600).toISOString());
    expect(next.visitCount).toBe(1);
  });

  it("survives a stored row that is nonsense", () => {
    const next = accrueActivity(
      { firstSeenAt: "", lastSeenAt: "not a date", activeSeconds: Number.NaN, visitCount: -3 },
      start,
    );
    expect(next.activeSeconds).toBe(0);
    expect(next.visitCount).toBe(1);
    expect(next.lastSeenAt).toBe(start.toISOString());
  });

  it("keeps the first sighting for ever", () => {
    const previous = snapshot({ firstSeenAt: "2026-01-01T00:00:00.000Z" });
    const next = accrueActivity(previous, at(HEARTBEAT_SECONDS));
    expect(next.firstSeenAt).toBe("2026-01-01T00:00:00.000Z");
  });

  /*
   * Stated as a property rather than an example: whatever the traffic, the
   * recorded time can never exceed the wall clock it happened in.
   */
  it("can never record more time than actually elapsed", () => {
    let state = accrueActivity(null, start);
    const gaps = [60, 60, 5, 61, 3600, 60, 90, 1, 60, 20000, 60];
    let elapsed = 0;
    for (const gap of gaps) {
      elapsed += gap;
      state = accrueActivity(state, at(elapsed));
    }
    expect(state.activeSeconds).toBeLessThanOrEqual(elapsed);
  });
});

describe("describeDuration", () => {
  it("says it the way a person would", () => {
    expect(describeDuration(0)).toBe("—");
    expect(describeDuration(30)).toBe("<1m");
    expect(describeDuration(60)).toBe("1m");
    expect(describeDuration(45 * 60)).toBe("45m");
    expect(describeDuration(60 * 60)).toBe("1h");
    expect(describeDuration(82 * 60)).toBe("1h 22m");
  });

  it("shows nothing rather than a wrong something", () => {
    expect(describeDuration(-5)).toBe("—");
    expect(describeDuration(Number.NaN)).toBe("—");
  });
});
