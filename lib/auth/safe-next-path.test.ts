import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next-path";

const ORIGIN = "https://sartho.tech";

describe("safeNextPath", () => {
  it("keeps a path on this site, with its query and fragment", () => {
    expect(safeNextPath("/jobs", ORIGIN)).toBe("/jobs");
    expect(safeNextPath("/resume-studio?tab=drafts#drafts", ORIGIN)).toBe("/resume-studio?tab=drafts#drafts");
    expect(safeNextPath("/", ORIGIN)).toBe("/");
  });

  it("sends anything that would leave the site home instead", () => {
    expect(safeNextPath("https://evil.example/", ORIGIN)).toBe("/");
    expect(safeNextPath("//evil.example", ORIGIN)).toBe("/");
    /* The URL parser reads a backslash as a slash, so these are //evil.example. */
    expect(safeNextPath("/\\evil.example", ORIGIN)).toBe("/");
    expect(safeNextPath("/\\\\evil.example", ORIGIN)).toBe("/");
    expect(safeNextPath("/\\/evil.example", ORIGIN)).toBe("/");
    expect(safeNextPath("javascript:alert(1)", ORIGIN)).toBe("/");
    expect(safeNextPath("evil.example", ORIGIN)).toBe("/");
    expect(safeNextPath("", ORIGIN)).toBe("/");
    expect(safeNextPath(null, ORIGIN)).toBe("/");
  });

  it("never lands on an API or auth route", () => {
    expect(safeNextPath("/api/cron/daily-digest", ORIGIN)).toBe("/");
    expect(safeNextPath("/auth/callback?code=x", ORIGIN)).toBe("/");
  });
});
