import { describe, expect, it } from "vitest";
import { siteMetadata } from "@/lib/site-metadata";
import { SITE_DESCRIPTION, SITE_URL } from "@/lib/site";

/*
 * sartho.tech shipped with no Open Graph or Twitter tags at all, so every shared
 * link — the beta invite, the LinkedIn post — rendered as a bare blue URL with
 * no title card and no image.
 *
 * Absent metadata fails silently: the page looks perfect to the person who
 * built it and blank to everyone it is sent to. Nothing else in the test suite
 * would notice it going missing again, so these assert the specific fields a
 * scraper reads.
 */
describe("site metadata", () => {
  it("resolves relative Open Graph URLs against an absolute origin", () => {
    /*
     * The one field that cannot be omitted. Without metadataBase, Next emits a
     * relative image path, which every scraper discards.
     */
    const base = siteMetadata.metadataBase;
    expect(base).toBeInstanceOf(URL);
    // Narrows for the assertions below; a string would still resolve, but only
    // a URL guarantees the origin is well-formed.
    if (!(base instanceof URL)) throw new Error("metadataBase must be a URL");
    expect(base.origin).toBe(SITE_URL);
    expect(base.protocol).toBe("https:");
  });

  it("gives a shared link a name, a description and a site", () => {
    const og = siteMetadata.openGraph;
    expect(og).toBeDefined();
    expect(og?.title).toMatch(/Sartho/);
    expect(og?.description).toBe(SITE_DESCRIPTION);
    expect(og && "siteName" in og ? og.siteName : undefined).toBe("Sartho");
    expect(og && "type" in og ? og.type : undefined).toBe("website");
  });

  it("asks for the wide card, since the image carries the headline", () => {
    const twitter = siteMetadata.twitter;
    expect(twitter && "card" in twitter ? twitter.card : undefined).toBe("summary_large_image");
    expect(twitter?.title).toMatch(/Sartho/);
  });

  it("names one canonical URL so duplicate hosts do not compete", () => {
    expect(siteMetadata.alternates?.canonical).toBe("/");
  });

  it("keeps the description it already ranked on", () => {
    // Changing this silently is an SEO regression, not a copy tweak.
    expect(siteMetadata.description).toMatch(/evidence-led AI career copilot/);
  });
});
