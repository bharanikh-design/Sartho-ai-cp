import { describe, expect, it } from "vitest";
import {
  getMobileNavigation,
  getNavigationWithGate,
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
      "Career Direction",
      "Find Roles",
      "Opportunities",
      "Résumé Studio",
      "Browser Extension",
    ];
    expect(getPrimaryNavigation(false).map((item) => item.label)).toEqual(flow);
    expect(getPrimaryNavigation(true).map((item) => item.label)).toEqual(flow);
    expect(getMobileNavigation(true)).toHaveLength(4);
  });

  it("leaves a primary destination in place when opened directly", () => {
    // Applications is a primary item now, so opening it needs no appended tab.
    expect(getNavigationForPath(false, "/applications").map((item) => item.label)).toEqual([
      "Dashboard",
      "Career Direction",
      "Find Roles",
      "Opportunities",
      "Résumé Studio",
      "Browser Extension",
    ]);
  });
});

describe("résumé gate", () => {
  it("locks every destination except the Dashboard until a résumé exists", () => {
    const locked = getNavigationWithGate(false, false);
    expect(locked.find((item) => item.href === "/")?.lockedReason).toBeUndefined();
    expect(locked.filter((item) => item.href !== "/").every((item) => item.lockedReason)).toBe(true);
  });

  it("unlocks everything once a résumé is in", () => {
    expect(getNavigationWithGate(false, true).some((item) => item.lockedReason)).toBe(false);
  });

  it("no longer carries Upload Résumé as a destination — it is the Dashboard", () => {
    expect(getNavigationWithGate(true, true).map((item) => item.href)).not.toContain("/career-truth");
  });
});

/*
 * Opening a saved role lit nothing in the rail. /jobs/[id] is where a role
 * lives, the /jobs menu entry went away when Opportunities took that name, and
 * nothing was left claiming the route — so the product forgot where you were.
 */
describe("routes a menu item owns without living at", () => {
  it("lights Opportunities on a saved role", () => {
    expect(isNavigationItemActive("/jobs/6f1c-not-a-real-id", "/applications")).toBe(true);
    expect(isNavigationItemActive("/jobs", "/applications")).toBe(true);
    expect(isNavigationItemActive("/applications", "/applications")).toBe(true);
  });

  it("lights exactly one item", () => {
    const lit = getPrimaryNavigation(true).filter((item) => isNavigationItemActive("/jobs/abc", item.href));
    expect(lit.map((item) => item.label)).toEqual(["Opportunities"]);
  });

  it("does not light Opportunities elsewhere", () => {
    for (const path of ["/", "/resume-studio", "/career-direction", "/search-plan"]) {
      expect(isNavigationItemActive(path, "/applications")).toBe(false);
    }
  });
})
