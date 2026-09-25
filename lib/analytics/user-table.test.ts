import { describe, expect, it } from "vitest";
import { buildUserTable, summariseUserTable, type UserTableInput } from "@/lib/analytics/user-table";

const base = (overrides: Partial<UserTableInput> = {}): UserTableInput => ({
  accounts: [],
  profiles: [],
  activity: [],
  resumeUploaded: new Set(),
  masterResumeReady: new Set(),
  journeyCompleted: new Set(),
  searchStarted: new Set(),
  applied: new Set(),
  interviewed: new Set(),
  hired: new Set(),
  savedJobCounts: new Map(),
  ...overrides,
});

const account = (id: string, overrides: Partial<UserTableInput["accounts"][number]> = {}) => ({
  id,
  email: id + "@example.com",
  createdAt: "2026-08-01T09:00:00.000Z",
  lastSignInAt: "2026-09-01T09:00:00.000Z",
  provider: "google",
  ...overrides,
});

describe("buildUserTable", () => {
  it("joins identity, engagement and the full lifecycle", () => {
    const [row] = buildUserTable(base({
      accounts: [account("u1")],
      profiles: [{ id: "u1", fullName: "Bharani Kumar", location: "Singapore" }],
      activity: [{ userId: "u1", lastSeenAt: "2026-09-06T20:00:00.000Z", activeSeconds: 4920, visitCount: 12 }],
      resumeUploaded: new Set(["u1"]),
      masterResumeReady: new Set(["u1"]),
      journeyCompleted: new Set(["u1"]),
      searchStarted: new Set(["u1"]),
      applied: new Set(["u1"]),
      interviewed: new Set(["u1"]),
      hired: new Set(["u1"]),
      savedJobCounts: new Map([["u1", 8]]),
    }));

    expect(row.name).toBe("Bharani Kumar");
    expect(row.location).toBe("Singapore");
    expect(row.provider).toBe("google");
    expect(row.activeTime).toBe("1h 22m");
    expect(row.averageVisitTime).toBe("6m");
    expect(row.savedJobs).toBe(8);
    expect(row.progress).toBe(7);
    expect(row.hired).toBe(true);
  });

  it("distinguishes measured activity from last sign-in", () => {
    const [measured] = buildUserTable(base({
      accounts: [account("u1", { lastSignInAt: "2026-08-02T09:00:00.000Z" })],
      activity: [{ userId: "u1", lastSeenAt: "2026-09-06T20:00:00.000Z", activeSeconds: 60, visitCount: 1 }],
    }));
    expect(measured.lastActiveIsMeasured).toBe(true);

    const [unmeasured] = buildUserTable(base({
      accounts: [account("u2", { lastSignInAt: "2026-08-02T09:00:00.000Z" })],
    }));
    expect(unmeasured.lastActiveIsMeasured).toBe(false);
    expect(unmeasured.lastActiveAt).toBe("2026-08-02T09:00:00.000Z");
  });

  it("never invents identity or progress", () => {
    const [row] = buildUserTable(base({
      accounts: [account("u1", { email: null, provider: null })],
      profiles: [{ id: "u1", fullName: "   ", location: null }],
    }));
    expect(row.name).toBe("—");
    expect(row.email).toBe("—");
    expect(row.location).toBe("—");
    expect(row.provider).toBe("—");
    expect(row.progress).toBe(0);
  });

  it("calculates average active time per visit from observed time only", () => {
    const [row] = buildUserTable(base({
      accounts: [account("u1")],
      activity: [{ userId: "u1", lastSeenAt: "2026-09-06T20:00:00.000Z", activeSeconds: 900, visitCount: 3 }],
    }));
    expect(row.averageVisitSeconds).toBe(300);
    expect(row.averageVisitTime).toBe("5m");
  });

  it("sorts recently active accounts first", () => {
    const rows = buildUserTable(base({
      accounts: [
        account("old", { lastSignInAt: "2026-07-01T09:00:00.000Z" }),
        account("never", { lastSignInAt: null }),
        account("recent", { lastSignInAt: "2026-09-06T09:00:00.000Z" }),
      ],
    }));
    expect(rows.map((row) => row.id)).toEqual(["recent", "old", "never"]);
  });
});

describe("summariseUserTable", () => {
  const now = new Date("2026-09-06T21:00:00.000Z");

  it("summarises engagement and lifecycle conversion", () => {
    const rows = buildUserTable(base({
      accounts: [account("a"), account("b")],
      activity: [
        { userId: "a", lastSeenAt: "2026-09-06T20:00:00.000Z", activeSeconds: 600, visitCount: 2 },
        { userId: "b", lastSeenAt: "2026-09-06T19:00:00.000Z", activeSeconds: 300, visitCount: 1 },
      ],
      resumeUploaded: new Set(["a", "b"]),
      masterResumeReady: new Set(["a", "b"]),
      journeyCompleted: new Set(["a"]),
      searchStarted: new Set(["a"]),
      applied: new Set(["a"]),
      interviewed: new Set(["a"]),
      hired: new Set(["a"]),
    }));

    const summary = summariseUserTable(rows, now);
    expect(summary.total).toBe(2);
    expect(summary.averageActiveSeconds).toBe(450);
    expect(summary.averageVisitSeconds).toBe(300);
    expect(summary.resumeUploaded).toBe(2);
    expect(summary.journeyCompleted).toBe(1);
    expect(summary.hired).toBe(1);
  });

  it("returns zeroes for an empty product", () => {
    const summary = summariseUserTable([], now);
    expect(summary.total).toBe(0);
    expect(summary.averageActiveSeconds).toBe(0);
    expect(summary.hired).toBe(0);
  });
});
