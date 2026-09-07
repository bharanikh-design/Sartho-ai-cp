import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { EXTENSION_DOWNLOAD_PATH, EXTENSION_VERSION } from "@/lib/extension";
import { config } from "@/proxy";

const root = path.resolve(__dirname, "..");

describe("the extension download", () => {
  /*
   * The install page said "get sartho-extension.zip from the Sartho
   * repository". There was no link, because the zip was gitignored and outside
   * public/ — so nothing was ever downloadable, and the page read as though
   * something was.
   */
  it("is built into public/ where the site can serve it", () => {
    execFileSync("node", ["scripts/build-extension-zip.mjs"], { cwd: root, stdio: "pipe" });
    const bytes = readFileSync(path.join(root, "public", EXTENSION_DOWNLOAD_PATH.replace(/^\//, "")));
    expect(bytes.length).toBeGreaterThan(1_000);
  });

  /*
   * "Load unpacked" asks for the folder containing manifest.json. A flat zip
   * leaves that folder to whatever the person's unzip tool decides, which on
   * some tools is to scatter eleven files into Downloads.
   */
  it("nests everything under one folder holding the manifest", async () => {
    execFileSync("node", ["scripts/build-extension-zip.mjs"], { cwd: root, stdio: "pipe" });
    const zip = await JSZip.loadAsync(readFileSync(path.join(root, "public", "sartho-extension.zip")));
    const names = Object.keys(zip.files);

    expect(names).toContain("sartho-extension/manifest.json");
    for (const name of names) expect(name.startsWith("sartho-extension/")).toBe(true);
    /* The parts that make it an extension rather than a folder of files. */
    for (const file of ["background.js", "popup.js", "scrape.js", "icons/icon-128.png"]) {
      expect(names).toContain(`sartho-extension/${file}`);
    }
  });

  /*
   * An unpacked extension never updates itself, so the number on the popup is
   * the only way anybody can tell last week's build from today's. A page
   * claiming one version while handing over another makes that check actively
   * misleading — worse than showing no version at all.
   */
  it("states the version it actually hands over", async () => {
    expect(EXTENSION_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    execFileSync("node", ["scripts/build-extension-zip.mjs"], { cwd: root, stdio: "pipe" });
    const zip = await JSZip.loadAsync(readFileSync(path.join(root, "public", "sartho-extension.zip")));
    const manifest = JSON.parse(await zip.file("sartho-extension/manifest.json")!.async("string")) as { version: string };
    expect(manifest.version).toBe(EXTENSION_VERSION);
  });
});

/*
 * The guard must not stand in front of the download.
 *
 * The whole point of the link is that somebody who has never signed in can
 * click it. Guarded, it answered with a 307 to /login — which a browser
 * follows, saving an HTML sign-in page under the name of a zip. That failure
 * looks like a corrupt download, not like an auth redirect.
 */
describe("the request proxy", () => {
  const matcher = new RegExp(`^${(config.matcher as string[])[0]}$`);

  it("lets the extension zip through", () => {
    expect(matcher.test("/sartho-extension.zip")).toBe(false);
  });

  it("still guards the product pages", () => {
    for (const guarded of ["/applications", "/resume-studio", "/notifications", "/opportunities"]) {
      expect(matcher.test(guarded)).toBe(true);
    }
  });

  /*
   * A page is not a static file because its name ends in something familiar.
   * Without the anchor, "/secret.zip.html" or a route merely containing ".zip"
   * would slip past the guard.
   */
  it("does not unguard a page that merely mentions an asset extension", () => {
    expect(matcher.test("/sartho-extension.zip.html")).toBe(true);
    expect(matcher.test("/zip")).toBe(true);
  });
});
