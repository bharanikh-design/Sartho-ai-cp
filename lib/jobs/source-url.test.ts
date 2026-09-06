import { describe, expect, it } from "vitest";
import { canonicalJobUrl, isSameJobUrl } from "@/lib/jobs/source-url";

/*
 * The extension makes saving a role one click, and one click is easy to do
 * twice. These are the shapes the same advert actually arrives in.
 */
describe("canonicalJobUrl", () => {
  it("treats one LinkedIn advert reached three ways as one advert", () => {
    const fromSearch = "https://www.linkedin.com/jobs/view/4012345678/?refId=xY9&trackingId=abc%3D%3D";
    const fromAlert = "https://www.linkedin.com/jobs/view/4012345678/?eBP=NOT_EL&trk=flagship_job";
    const bare = "https://linkedin.com/jobs/view/4012345678";

    expect(canonicalJobUrl(fromSearch)).toBe(canonicalJobUrl(bare));
    expect(canonicalJobUrl(fromAlert)).toBe(canonicalJobUrl(bare));
    expect(canonicalJobUrl(bare)).toBe("https://linkedin.com/jobs/view/4012345678");
  });

  /*
   * The rule that must not be "strip the query string". On Indeed the query IS
   * the advert, and collapsing them would merge every Indeed job into one row.
   */
  it("keeps the parameter that identifies the advert on Indeed", () => {
    const first = canonicalJobUrl("https://au.indeed.com/viewjob?jk=abc123&from=serp&tk=xyz");
    const second = canonicalJobUrl("https://www.indeed.com/viewjob?jk=abc123");
    const different = canonicalJobUrl("https://au.indeed.com/viewjob?jk=def456");

    expect(first).toContain("jk=abc123");
    expect(different).not.toBe(first);
    /* Same advert, different country domain, is still a different URL — we do
     * not claim to know that au.indeed.com and www.indeed.com are one board. */
    expect(second).toContain("jk=abc123");
  });

  it("keeps Seek's job id", () => {
    expect(canonicalJobUrl("https://www.seek.com.au/job/12345678?type=standout&ref=search"))
      .toBe("https://seek.com.au/job/12345678");
  });

  it("drops the fragment and a trailing slash", () => {
    expect(canonicalJobUrl("https://careers.example.com/roles/482/#apply"))
      .toBe("https://careers.example.com/roles/482");
  });

  it("folds http and www into one form", () => {
    expect(canonicalJobUrl("http://www.example.com/jobs/1"))
      .toBe(canonicalJobUrl("https://example.com/jobs/1"));
  });

  /*
   * On a host we know nothing about, an unrecognised parameter may well be the
   * advert — /jobs?id=482 is an ordinary careers page — so it is kept.
   */
  it("keeps unknown parameters on an unknown host, but not tracking ones", () => {
    expect(canonicalJobUrl("https://careers.example.com/jobs?id=482&utm_source=email&gclid=zz"))
      .toBe("https://careers.example.com/jobs?id=482");
  });

  it("does not care about parameter order", () => {
    expect(canonicalJobUrl("https://careers.example.com/jobs?b=2&a=1"))
      .toBe(canonicalJobUrl("https://careers.example.com/jobs?a=1&b=2"));
  });

  it("returns nothing rather than throwing on whatever was in the address bar", () => {
    for (const bad of ["", "   ", "not a url", "javascript:alert(1)", "chrome://extensions", null, undefined]) {
      expect(canonicalJobUrl(bad)).toBeNull();
    }
  });
});

describe("isSameJobUrl", () => {
  it("matches the same advert and separates different ones", () => {
    expect(isSameJobUrl(
      "https://www.linkedin.com/jobs/view/4012345678/?refId=a",
      "https://linkedin.com/jobs/view/4012345678",
    )).toBe(true);
    expect(isSameJobUrl(
      "https://linkedin.com/jobs/view/4012345678",
      "https://linkedin.com/jobs/view/9999999999",
    )).toBe(false);
  });

  /* Two roles typed in by hand have no URL, and are not therefore the same role. */
  it("never calls two missing URLs a match", () => {
    expect(isSameJobUrl(null, null)).toBe(false);
    expect(isSameJobUrl("", "")).toBe(false);
  });
});
