import { describe, expect, it } from "vitest";
import { digestHealth } from "@/lib/notifications/digest-health";

const now = new Date("2026-09-06T21:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

describe("digestHealth", () => {
  it("says nothing is being sent when the digest is off", () => {
    const health = digestHealth({ enabled: false, lastSentAt: hoursAgo(400), now });
    expect(health.state).toBe("off");
    expect(health.concerning).toBe(false);
  });

  it("reports a schedule that is running", () => {
    const health = digestHealth({ enabled: true, lastSentAt: hoursAgo(6), now });
    expect(health.state).toBe("healthy");
    expect(health.concerning).toBe(false);
    expect(health.message).toContain("6 hours ago");
  });

  /*
   * The claim this module exists to make — and the one it must not make
   * wrongly, because it sends somebody looking for a fault.
   */
  it("calls a multi-day gap what it is", () => {
    const health = digestHealth({ enabled: true, lastSentAt: hoursAgo(24 * 9), now });
    expect(health.state).toBe("overdue");
    expect(health.concerning).toBe(true);
    expect(health.message).toContain("9 days");
    expect(health.message).toContain("not reaching Sartho");
  });

  it("does not cry broken over a schedule running a few hours late", () => {
    /* A daily job can drift. 30 hours is late; it is not evidence of a fault. */
    const health = digestHealth({ enabled: true, lastSentAt: hoursAgo(30), now });
    expect(health.state).toBe("healthy");
    expect(health.concerning).toBe(false);
    expect(health.message).toContain("later than usual");
  });

  it("holds the line exactly at the boundary", () => {
    expect(digestHealth({ enabled: true, lastSentAt: hoursAgo(48), now }).state).toBe("healthy");
    expect(digestHealth({ enabled: true, lastSentAt: hoursAgo(49), now }).state).toBe("overdue");
  });

  describe("when nothing has ever been sent", () => {
    it("treats a freshly enabled digest as waiting, not broken", () => {
      const health = digestHealth({ enabled: true, lastSentAt: null, enabledSince: hoursAgo(1), now });
      expect(health.state).toBe("waiting");
      expect(health.concerning).toBe(false);
      expect(health.message).toContain("next scheduled run");
    });

    it("calls it broken once it has been on for days with nothing sent", () => {
      const health = digestHealth({ enabled: true, lastSentAt: null, enabledSince: hoursAgo(24 * 5), now });
      expect(health.state).toBe("overdue");
      expect(health.concerning).toBe(true);
    });

    /*
     * With no record of when it was switched on, the honest answer is that we
     * are waiting — an accusation needs evidence, and there is none here.
     */
    it("waits rather than accuses when it cannot tell how long it has been on", () => {
      const health = digestHealth({ enabled: true, lastSentAt: null, now });
      expect(health.state).toBe("waiting");
      expect(health.concerning).toBe(false);
    });
  });

  it("survives a timestamp that is not one", () => {
    for (const bad of ["", "not a date", "0000-00-00"]) {
      const health = digestHealth({ enabled: true, lastSentAt: bad, now });
      expect(health.state).toBe("waiting");
    }
  });

  it("reads a Date as happily as a string", () => {
    const health = digestHealth({ enabled: true, lastSentAt: new Date(now.getTime() - 3 * 60 * 60 * 1000), now });
    expect(health.message).toContain("3 hours ago");
  });

  it("phrases a very recent send without a bare zero", () => {
    const health = digestHealth({ enabled: true, lastSentAt: hoursAgo(0.2), now });
    expect(health.message).toContain("less than an hour");
  });
});

/*
 * Match alerts run on their own daily schedule and go silent in exactly the
 * same way, so they get the same reasoning. Only the noun changes: telling
 * somebody "no summary has been sent" about an alert sends them to the wrong
 * switch.
 */
describe("the email it is talking about", () => {
  const now = new Date("2026-09-07T12:00:00Z");
  const hoursBefore = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString();

  it("says summary when nothing else is asked for", () => {
    expect(digestHealth({ enabled: true, lastSentAt: null, now }).message).toContain("No summary has been sent yet");
    expect(digestHealth({ enabled: false, lastSentAt: null, now }).message).toContain("The daily summary is off");
  });

  it("names the alert instead when it is asked to", () => {
    const noun = "match alert";
    expect(digestHealth({ enabled: true, lastSentAt: null, noun, now }).message).toContain("No match alert has been sent yet");
    expect(digestHealth({ enabled: false, lastSentAt: null, noun, now }).message).toContain("The daily match alert is off");
    expect(digestHealth({ enabled: true, lastSentAt: hoursBefore(3), noun, now }).message).toContain("The last match alert was sent");
    expect(digestHealth({ enabled: true, lastSentAt: hoursBefore(30), noun, now }).message).toContain("The last match alert was sent");
  });

  /* The one message that accuses the deployment has to name it correctly too. */
  it("keeps the noun in the sentence that reports a fault", () => {
    const overdue = digestHealth({ enabled: true, lastSentAt: hoursBefore(90), noun: "match alert", now });
    expect(overdue.state).toBe("overdue");
    expect(overdue.message).toContain("The last match alert was sent");

    const never = digestHealth({ enabled: true, lastSentAt: null, enabledSince: hoursBefore(90), noun: "match alert", now });
    expect(never.state).toBe("overdue");
    expect(never.message).toContain("No match alert has ever been sent");
  });

  it("falls back to summary for a blank noun rather than printing a gap", () => {
    expect(digestHealth({ enabled: true, lastSentAt: null, noun: "   ", now }).message).toContain("No summary has been sent yet");
  });
});
