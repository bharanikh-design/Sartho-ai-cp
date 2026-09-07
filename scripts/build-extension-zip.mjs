/*
 * Package extension/ into public/sartho-extension.zip so the site can hand it
 * over on a click.
 *
 * There was no download. The install page's first step said "get
 * sartho-extension.zip from the Sartho repository", which asks somebody who
 * wants a browser extension to go and find a git repository — and the zip at
 * the repo root was gitignored and outside public/, so it never reached the
 * deployment at all. Nothing was ever downloadable.
 *
 * Built here rather than committed, for one reason: a checked-in binary goes
 * stale the first time anybody edits extension/ and forgets to rebuild it, and
 * an unpacked extension never updates itself — so a stale zip is a bug that
 * lives on somebody's machine for months. Running on every build means the
 * download is always the code in this commit.
 *
 * Written with JSZip rather than shelling out to `zip`, which is not guaranteed
 * on a build image; a missing binary would fail the deploy or, worse, quietly
 * produce nothing.
 */

import { createRequire } from "node:module";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const JSZip = require("jszip");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "extension");
const target = path.join(root, "public", "sartho-extension.zip");

/*
 * Everything nests under one folder inside the zip. "Load unpacked" asks for
 * the folder containing manifest.json, and a flat zip leaves that folder up to
 * whatever the person's unzip tool decides to do — which on some tools is to
 * scatter eleven files into Downloads.
 */
const FOLDER = "sartho-extension";

/*
 * A fixed timestamp on every entry, so an unchanged extension produces a
 * byte-identical file and a rebuild is distinguishable from a real change.
 */
const FIXED_DATE = new Date("2020-01-01T00:00:00Z");

/* The extension is source, not a build: nothing here is generated or bundled. */
const SKIP = new Set(["README.md", ".DS_Store"]);

async function addDirectory(zip, directory, prefix) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) await addDirectory(zip, full, name);
    else zip.file(name, await readFile(full), { date: FIXED_DATE });
  }
}

const manifest = JSON.parse(await readFile(path.join(source, "manifest.json"), "utf8"));

const zip = new JSZip();
await addDirectory(zip, source, FOLDER);

/*
 * Fail loudly rather than shipping an empty archive. A zip that downloads and
 * then will not load is far harder to diagnose than a build that stopped.
 */
if (!zip.file(`${FOLDER}/manifest.json`)) {
  throw new Error("extension/manifest.json is missing — refusing to write an unloadable zip.");
}

await mkdir(path.dirname(target), { recursive: true });
const bytes = await zip.generateAsync({
  type: "nodebuffer",
  compression: "DEFLATE",
  compressionOptions: { level: 9 },
});
await writeFile(target, bytes);

console.log(`Wrote public/sartho-extension.zip — v${manifest.version}, ${(bytes.length / 1024).toFixed(0)}KB`);
