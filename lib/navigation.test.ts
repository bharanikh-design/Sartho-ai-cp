import { describe, expect, it } from "vitest";
import {
  getMobileNavigation,
  getNavigationForPath,
  getPageLabel,
  getPrimaryNavigation,
  isNavigationItemActive,
  primaryNavigation,
} from "./navigation";

describe("primary navigation", () => {
  it("maps each destination to one unique route with a stated purpose", () => {
    expect(new Set(primaryNavigation.map((item) => item.href)).size).toBe(primaryNavigation.length);
    expect(primaryNavigation.every((item) => item.purpose.trim().length > 0)).toBe(true);
  });

  it("selects Opportunities for the opportunity workspace and saved role detail", () => {
    expect(getPageLabel("/jobs")).toBe("Opportunities");
    expect(getPageLabel("/jobs/role-123")).toBe("Opportunities");
    expect(isNavigationItemActive("/jobs/role-123", "/jobs")).toBe(true);
    expect(isNavigationItemActive("/jobs", "/search-plan")).toBe(false);
  });

  it("does not let the dashboard match every route", () => {
    expect(isNavigationItemActive("/", "/")).toBe(true);
    expect(isNavigationItemActive("/journey", "/")).toBe(false);
  });

  it("labels supporting workflow pages without adding them to primary navigation", () => {
    expect(getPageLabel("/resume-studio")).toBe("Résumé Studio");
    expect(primaryNavigation.some((item) => item.href === "/resume-studio")).toBe(false);
  });

  it("keeps Dashboard visible while setup is incomplete and expands the outcome loop afterwards", () => {
    expect(getPrimaryNavigation(false).map((item) => item.label)).toEqual([
      "Dashboard",
      "Your Journey",
      "Career Profile",
      "Search Brief",
    ]);
    expect(getPrimaryNavigation(true).map((item) => item.label)).toEqual([
      "Dashboard",
      "Opportunities",
      "Applications",
      "Career Profile",
      "Search Brief",
    ]);
    expect(getMobileNavigation(true)).toHaveLength(4);
  });

  it("keeps a directly opened contextual destination visible and active", () => {
    expect(getNavigationForPath(false, "/jobs").map((item) => item.label)).toEqual([
      "Dashboard",
      "Your Journey",
      "Career Profile",
      "Search Brief",
      "Opportunities",
    ]);
  });
});
