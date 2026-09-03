import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";

/*
 * Declared here rather than inside app/layout.tsx so it can be asserted on
 * directly. The layout imports a dozen stylesheets, which makes it unimportable
 * from a node test — and metadata that cannot be tested is metadata that
 * silently disappears in a refactor, which is how the site came to have none.
 *
 * metadataBase is what turns a relative Open Graph image into the absolute URL
 * crawlers require. Without it Next emits a relative path, every scraper drops
 * it, and the tag is present while the preview stays blank.
 */
export const siteMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en",
  },
  twitter: {
    // The wide card, because the image carries the headline.
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  alternates: {
    canonical: "/",
  },
};
