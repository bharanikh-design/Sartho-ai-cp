import { describe, expect, it } from "vitest";
import robots from "@/app/robots";

/*
 * There was no robots.txt, and the auth guard turned the request into a 307 to
 * /login. Google reads an unparseable robots.txt as "no rules published", so the
 * effective crawl policy was decided by accident.
 *
 * Two things have to hold together for this to be fixed, and each is useless
 * alone: the file must exist (here) and the guard must let it through
 * (lib/supabase/proxy.test.ts).
 */
describe("robots.txt", () => {
  const rules = robots().rules;
  const rule = Array.isArray(rules) ? rules[0] : rules;

  it("lets the sign-in page be found", () => {
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");
  });

  it("keeps crawlers out of endpoints that are not pages", () => {
    const disallow = [rule.disallow].flat().filter(Boolean);
    expect(disallow).toContain("/api/");
    /*
     * /auth carries one-time OAuth codes. A crawler following one would spend
     * a code that belongs to a person mid-sign-in.
     */
    expect(disallow).toContain("/auth/");
  });

  it("does not disallow everything, which would delist the public page", () => {
    const disallow = [rule.disallow].flat().filter(Boolean);
    expect(disallow).not.toContain("/");
  });
});
