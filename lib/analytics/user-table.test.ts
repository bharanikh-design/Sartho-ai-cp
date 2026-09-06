import { describe, expect, it } from "vitest";
import { buildUserTable, summariseUserTable, type UserTableInput } from "@/lib/analytics/user-table";

const base = (overrides: Partial<UserTableInput> = {}): UserTableInput => ({
  accounts: [],
  profiles: [],
  activity: [],
  resumeUploaded: new Set(),
  directionComplete: new Set(),
  searchStarted: new Set(),
  notificationsOn: new Set(),
  ...overrides,
});

const account = (id: string, overrides: Partial<UserTableInput["accounts"][number]> = {}) => ({
  id,
  email: `${id}@example.com`,
  createdAt: "2026-08-01T09:00:00.000Z",
  lastSignInAt: "2026-09-01T09:00:00.000Z",
  ...overrides,
});

describe("buildUserTable", () => {
  it("puts a person's details, funnel and time together", () => {
    const [row] = buildUserTable(base({
      accounts: [account("u1")],
      profiles: [{ id: "u1", fullName: "Bharani Kumar", location: "Sydney, NSW" }],
      activity: [{ userId: "u1", lastSeenAt: "2026-09-06T20:00:00.000Z", activeSeconds: 4920, visitCount: 12 }],
      resumeUploaded: new Set(["u1"]),
      directionComplete: new Set(["u1"]),
      searchStarted: new Set(["u1"]),
      notificationsOn: new Set(["u1"]),
    }));

    expect(row.name).toBe("Bharani Kumar");
    expect(row.email).toBe("u1@example.com");
    expect(row.location).toBe("Sydney, NSW");
    expect(row.firstSeenAt).toBe("2026-08-01T09:00:00.000Z");
    expect(row.activeTime).toBe("1h 22m");
    expect(row.visitCount).toBe(12);
    expect(row.progress).toBe(4);
  });

  /*
   * The distinction this table would otherwise get wrong. Sessions persist for
   * weeks, so last sign-in presented as "last active" flatters every user who
   * has not signed out — which is most of them.
   */
  it("tells a measured activity reading apart from a mere sign-in", () => {
    const [measured] = buildUserTable(base({
      accounts: [account("u1", { lastSignInAt: "2026-08-02T09:00:00.000Z" })],
      activity: [{ userId: "u1", lastSeenAt: "2026-09-06T20:00:00.000Z", activeSeconds: 60, visitCount: 1 }],
    }));
    expect(measured.lastActiveIsMeasured).toBe(true);
    expect(measured.lastActiveAt).toBe("2026-09-06T20:00:00.000Z");

    const [unmeasured] = buildUserTable(base({
      accounts: [account("u2", { lastSignInAt: "2026-08-02T09:00:00.000Z" })],
    }));
    expect(unmeasured.lastActiveIsMeasured).toBe(false);
    expect(unmeasured.lastActiveAt).toBe("2026-08-02T09:00:00.000Z");
  });

  it("never invents a name, an email or a location", () => {
    const [row] = buildUserTable(base({
      accounts: [account("u1", { email: null })],
      profiles: [{ id: "u1", fullName: "   ", location: null }],
    }));
    expect(row.name).toBe("—");
    expect(row.email).toBe("—");
    expect(row.location).toBe("—");
    expect(row.activeTime).toBe("—");
    expect(row.progress).toBe(0);
  });

  it("handles somebody who signed up and never came back", () => {
    const [row] = buildUserTable(base({ accounts: [account("u1")] }));
    expect(row.activeSeconds).toBe(0);
    expect(row.visitCount).toBe(0);
    expect(row.resumeUploaded).toBe(false);
  });

  it("counts partial progress", () => {
    const [row] = buildUserTable(base({
      accounts: [account("u1")],
      resumeUploaded: new Set(["u1"]),
      directionComplete: new Set(["u1"]),
    }));
    expect(row.progress).toBe(2);
    expect(row.searchStarted).toBe(false);
  });

  it("sorts the people still here to the top, and the never-seen to the bottom", () => {
    const rows = buildUserTable(base({
      accounts: [
        account("old", { lastSignInAt: "2026-07-01T09:00:00.000Z" }),
        account("never", { lastSignInAt: null, createdAt: "2026-08-20T09:00:00.000Z" }),
        account("recent", { lastSignInAt: "2026-09-06T09:00:00.000Z" }),
      ],
    }));
    expect(rows.map((row) => row.id)).toEqual(["recent", "old", "never"]);
  });

  it("does not fall over on a profile or activity row for somebody not listed", () => {
    const rows = buildUserTable(base({
      accounts: [account("u1")],
      profiles: [{ id: "ghost", fullName: "Nobody", location: "Nowhere" }],
      activity: [{ userId: "ghost", lastSeenAt: "2026-09-06T20:00:00.000Z", activeSeconds: 99, visitCount: 9 }],
    }));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("—");
  });

  it("refuses a negative or fractional reading rather than showing it", () => {
    const [row] = buildUserTable(base({
      accounts: [account("u1")],
      activity: [{ userId: "u1", lastSeenAt: "2026-09-06T20:00:00.000Z", activeSeconds: -50, visitCount: 2.7 }],
    }));
    expect(row.activeSeconds).toBe(0);
    expect(row.visitCount).toBe(2);
  });
});

describe("summariseUserTable", () => {
  const now = new Date("2026-09-06T21:00:00.000Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  it("counts the funnel and who is still here", () => {
    const rows = buildUserTable(base({
      accounts: [
        account("a", { lastSignInAt: daysAgo(1) }),
        account("b", { lastSignInAt: daysAgo(10) }),
        account("c", { lastSignInAt: daysAgo(90) }),
      ],
      resumeUploaded: new Set(["a", "b"]),
      directionComplete: new Set(["a"]),
      searchStarted: new Set(["a"]),
      notificationsOn: new Set(["a"]),
    }));

    const summary = summariseUserTable(rows, now);
    expect(summary.total).toBe(3);
    expect(summary.activeLast7Days).toBe(1);
    expect(summary.activeLast30Days).toBe(2);
    expect(summary.resumeUploaded).toBe(2);
    expect(summary.fullyActivated).toBe(1);
  });

  it("says nothing rather than something about an empty product", () => {
    const summary = summariseUserTable([], now);
    expect(summary.total).toBe(0);
    expect(summary.fullyActivated).toBe(0);
  });
});
