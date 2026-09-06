import { describe, expect, it } from "vitest";
import { PUBLIC_PATHS, isPublicPath } from "@/lib/public-paths";

/*
 * These were two lists that disagreed: the request proxy let /extension
 * through while the app shell redirected it to /login, so a deliberately public
 * page was unreachable. One list now, and these are the shapes it must handle.
 */
describe("isPublicPath", () => {
  it("lets the pages that need no session through", () => {
    for (const path of PUBLIC_PATHS) expect(isPublicPath(path)).toBe(true);
  });

  it("keeps everything else behind a session", () => {
    for (const path of ["/", "/applications", "/search-plan", "/admin", "/diagnostics", "/resume-studio"]) {
      expect(isPublicPath(path)).toBe(false);
    }
  });

  it("treats a trailing slash as the same page", () => {
    expect(isPublicPath("/extension/")).toBe(true);
    expect(isPublicPath("/login/")).toBe(true);
  });

  /*
   * Prefix matching would be the obvious shortcut and the wrong one: it would
   * make /extensionsecrets public because it starts with /extension.
   */
  it("does not make a longer path public by accident", () => {
    expect(isPublicPath("/extension-admin")).toBe(false);
    expect(isPublicPath("/extension/secret")).toBe(false);
    expect(isPublicPath("/logins")).toBe(false);
  });

  it("keeps the operator pages private, which is the one that matters", () => {
    expect(isPublicPath("/admin")).toBe(false);
    expect(isPublicPath("/diagnostics")).toBe(false);
  });
});
