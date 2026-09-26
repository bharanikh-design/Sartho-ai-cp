import { describe, expect, it } from "vitest";
import { awayLabel, buildDailyBrief, type DailyBriefInput, type DailyBriefJob } from "./daily-brief";

const AT_9AM = new Date("2026-09-24T09:00:00");

function job(over: Partial<DailyBriefJob> = {}): DailyBriefJob {
  return { status: "saved", recommendation: null, deep_analysis_status: "not_started", ...over };
}

function input(over: Partial<DailyBriefInput> = {}): DailyBriefInput {
  return {
    now: AT_9AM,
    lastSeenAt: new Date("2026-09-23T18:00:00").toISOString(),
    firstName: "Bharani",
    jobs: [],
    pendingEvidence: 0,
    search: null,
    ...over,
  };
}

describe("the greeting", () => {
  it("reads the clock and uses the person's name", () => {
    expect(buildDailyBrief(input({ now: new Date("2026-09-24T07:30:00") })).greeting)
      .toBe("Good morning, Bharani.");
    expect(buildDailyBrief(input({ now: new Date("2026-09-24T14:00:00") })).greeting)
      .toBe("Good afternoon, Bharani.");
    expect(buildDailyBrief(input({ now: new Date("2026-09-24T20:00:00") })).greeting)
      .toBe("Good evening, Bharani.");
  });

  it("does not address somebody it cannot name", () => {
    expect(buildDailyBrief(input({ firstName: "  " })).greeting).toBe("Good morning.");
  });
});

describe("how long they have been away", () => {
  /*
   * The rule that stops the brief lying. A refresh is not a return, and the
   * same six roles announced as new every time would be worse than silence.
   */
  it("says nothing about a visit that never ended", () => {
    const fiveMinutesAgo = new Date(AT_9AM.getTime() - 5 * 60 * 1000).toISOString();
    expect(awayLabel(AT_9AM, fiveMinutesAgo)).toBeNull();
  });

  it("names the gap the way a person would", () => {
    expect(awayLabel(AT_9AM, new Date("2026-09-24T02:00:00").toISOString())).toBe("since earlier today");
    expect(awayLabel(AT_9AM, new Date("2026-09-23T18:00:00").toISOString())).toBe("since yesterday");
    expect(awayLabel(AT_9AM, new Date("2026-09-21T18:00:00").toISOString())).toBe("since Monday");
    expect(awayLabel(AT_9AM, new Date("2026-08-01T18:00:00").toISOString())).toBe("since your last visit");
  });

  it("copes with never having been seen, and with nonsense", () => {
    expect(awayLabel(AT_9AM, null)).toBeNull();
    expect(awayLabel(AT_9AM, "not a date")).toBeNull();
  });
});

describe("what it reports", () => {
  it("calls roles new only when the search ran after they left", () => {
    const brief = buildDailyBrief(input({
      search: { count: 6, searchedAt: new Date("2026-09-24T06:00:00").toISOString() },
    }));
    expect(brief.since).toBe("since yesterday");
    expect(brief.lines[0].text).toBe("6 new roles matched your brief");
    expect(brief.lines[0].tone).toBe("new");
  });

  /* The same six roles, on a refresh. They are waiting, not new. */
  it("does not re-announce the same roles as new on a refresh", () => {
    const brief = buildDailyBrief(input({
      lastSeenAt: new Date(AT_9AM.getTime() - 60 * 1000).toISOString(),
      search: { count: 6, searchedAt: new Date("2026-09-24T06:00:00").toISOString() },
    }));
    expect(brief.since).toBeNull();
    expect(brief.lines[0].text).toBe("6 roles from your search still waiting on you");
    expect(brief.lines[0].tone).toBe("waiting");
  });

  it("does not call roles new when the search predates the last visit", () => {
    const brief = buildDailyBrief(input({
      search: { count: 3, searchedAt: new Date("2026-09-20T10:00:00").toISOString() },
    }));
    expect(brief.lines[0].tone).toBe("waiting");
  });

  it("counts what is waiting, what is moving, and gets the plurals right", () => {
    const brief = buildDailyBrief(input({
      jobs: [
        job({ deep_analysis_status: "not_started" }),
        job({ deep_analysis_status: "complete", recommendation: "apply" }),
        job({ status: "interview", deep_analysis_status: "complete" }),
        job({ status: "applied", deep_analysis_status: "complete" }),
      ],
    }));
    const text = brief.lines.map((line) => line.text);
    expect(text).toContain("1 role waiting for analysis");
    expect(text).toContain("1 strong match ready for your decision");
    expect(text).toContain("1 role at interview stage");
    expect(text).toContain("1 application out with employers");
  });

  it("leaves closed roles out of everything", () => {
    const brief = buildDailyBrief(input({
      jobs: [job({ status: "rejected" }), job({ status: "hired" }), job({ status: "withdrawn" })],
    }));
    expect(brief.lines).toEqual([]);
  });

  it("stays a nudge rather than a wall", () => {
    const brief = buildDailyBrief(input({
      search: { count: 6, searchedAt: new Date("2026-09-24T06:00:00").toISOString() },
      pendingEvidence: 3,
      jobs: [
        job(),
        job({ deep_analysis_status: "complete", recommendation: "apply" }),
        job({ status: "interview", deep_analysis_status: "complete" }),
        job({ status: "applied", deep_analysis_status: "complete" }),
      ],
    }));
    expect(brief.lines.length).toBeLessThanOrEqual(4);
  });
});

describe("the steer at the end", () => {
  it("puts an interview above everything else", () => {
    const brief = buildDailyBrief(input({
      jobs: [job(), job({ status: "interview", deep_analysis_status: "complete" })],
    }));
    expect(brief.closing).toBe("The interview is the one worth your time today.");
  });

  it("falls to the decision, then to the analysis", () => {
    expect(buildDailyBrief(input({
      jobs: [job({ deep_analysis_status: "complete", recommendation: "apply" })],
    })).closing).toBe("Worth deciding on the strong matches before anything else.");

    expect(buildDailyBrief(input({ jobs: [job()] })).closing)
      .toBe("Start with the analysis — it is what tells you which of these is real.");
  });

  /* An empty brief is a good state and has to read like one, not like a nag. */
  it("says plainly when nothing needs them", () => {
    const brief = buildDailyBrief(input());
    expect(brief.lines).toEqual([]);
    expect(brief.closing).toBe("Nothing needs you right now — everything you have saved is up to date.");
  });
});
