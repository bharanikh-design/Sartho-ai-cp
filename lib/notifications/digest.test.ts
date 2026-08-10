import { describe, expect, it } from "vitest";
import { buildDailyDigest, renderDigestEmail } from "./digest";

const now = new Date("2026-08-10T00:00:00Z");

describe("daily digest", () => {
  it("separates new matches, active applications and recent outcomes", () => {
    const digest = buildDailyDigest([
      { title: "New role", employer: "A", status: "saved", recommendation: "apply", created_at: "2026-08-09T12:00:00Z", updated_at: "2026-08-09T12:00:00Z" },
      { title: "Applied role", employer: "B", status: "interview", recommendation: "review", created_at: "2026-07-01T00:00:00Z", updated_at: "2026-08-09T10:00:00Z" },
      { title: "Closed role", employer: "C", status: "rejected", recommendation: "review", created_at: "2026-07-01T00:00:00Z", updated_at: "2026-08-09T15:00:00Z" },
    ], new Date(now.getTime() - 24 * 60 * 60 * 1000));

    expect(digest.newMatches).toHaveLength(1);
    expect(digest.strongMatches).toHaveLength(1);
    expect(digest.applied).toHaveLength(1);
    expect(digest.outcomes).toHaveLength(1);
  });

  it("escapes user-controlled text in the email", () => {
    const email = renderDigestEmail("<Bharani>", buildDailyDigest([], now), "https://sartho.vercel.app");
    expect(email.html).toContain("&lt;Bharani&gt;");
    expect(email.html).not.toContain("Hello <Bharani>");
  });
});
