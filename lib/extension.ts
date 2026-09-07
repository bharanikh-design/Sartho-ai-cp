import manifest from "@/extension/manifest.json";

/*
 * The version of the extension this deployment is offering.
 *
 * Read from the manifest rather than typed into the install page, because the
 * two would drift and the drift would be invisible: an unpacked extension never
 * updates itself, so the number on the popup is the only way anybody can tell a
 * build from last week from today's. A page claiming 1.2.0 while handing over
 * 1.1.0 makes that check actively misleading — worse than not showing it.
 */
export const EXTENSION_VERSION: string = manifest.version;

/** The download the install page links to, built by scripts/build-extension-zip.mjs. */
export const EXTENSION_DOWNLOAD_PATH = "/sartho-extension.zip";
