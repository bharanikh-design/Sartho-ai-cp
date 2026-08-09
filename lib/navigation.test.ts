import { describe, expect, it } from "vitest";
import { getPageLabel, isNavigationItemActive, primaryNavigation } from "./navigation";

describe("primary navigation", () => {
  it("maps each destination to one unique route with a stated purpose", () => {
    expect(new Set(primaryNavigation.map((item) => item.href)).size).toBe(primaryNavigation.length);
    expect(primaryNavigation.every((item) => item.purpose.trim().length > 0)).toBe(true);
  });

  it("selects Analyse a Role for the opportunity workspace and saved role detail", () => {
    expect(getPageLabel("/jobs")).toBe("Analyse a Role");
    expect(getPageLabel("/jobs/role-123")).toBe("Analyse a Role");
    expect(isNavigationItemActive("/jobs/role-123", "/jobs")).toBe(true);
    expect(isNavigationItemActive("/jobs", "/search-plan")).toBe(false);
  });

  it("does not let the dashboard match every route", () => {
    expect(isNavigationItemActive("/", "/")).toBe(true);
    expect(isNavigationItemActive("/journey", "/")).toBe(false);
  });

  it("labels supporting workflow pages without adding them to primary navigation", () => {
    expect(getPageLabel("/career-truth")).toBe("Career Profile");
    expect(primaryNavigation.some((item) => item.href === "/career-truth")).toBe(false);
  });
});
