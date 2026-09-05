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
    expect(getPageLabel("/diagnostics")).toBe("Diagnostics");
    expect(primaryNavigation.some((item) => item.href === "/diagnostics")).toBe(false);
  });

  it("shows one flat process-order menu, the same before and after activation", () => {
    const flow = [
      "Dashboard",
      "Upload Résumé",
      "Career Direction",
      "Search Brief",
      "Applications",
      "Résumé Studio",
      "Email Alerts",
    ];
    expect(getPrimaryNavigation(false).map((item) => item.label)).toEqual(flow);
    expect(getPrimaryNavigation(true).map((item) => item.label)).toEqual(flow);
    expect(getMobileNavigation(true)).toHaveLength(4);
  });

  it("leaves a primary destination in place when opened directly", () => {
    // Applications is a primary item now, so opening it needs no appended tab.
    expect(getNavigationForPath(false, "/applications").map((item) => item.label)).toEqual([
      "Dashboard",
      "Upload Résumé",
      "Career Direction",
      "Search Brief",
      "Applications",
      "Résumé Studio",
      "Email Alerts",
    ]);
  });
});
