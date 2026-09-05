import type { Metadata } from "next";
import { siteMetadata } from "./site-metadata";
import { SITE_NAME } from "./site";

export function constructMetadata(
  title?: string,
  description?: string,
  path?: string
): Metadata {
  return {
    ...siteMetadata,
    title: title ? `${title} · ${SITE_NAME}` : siteMetadata.title,
    description: description || siteMetadata.description,
    openGraph: {
      ...siteMetadata.openGraph,
      title: title ? `${title} — ${SITE_NAME}` : siteMetadata.openGraph?.title,
      description: description || siteMetadata.openGraph?.description,
      url: path ? path : "/",
    },
    twitter: {
      ...siteMetadata.twitter,
      title: title ? `${title} — ${SITE_NAME}` : siteMetadata.twitter?.title,
      description: description || siteMetadata.twitter?.description,
    },
    alternates: {
      canonical: path ? path : "/",
    },
  };
}
