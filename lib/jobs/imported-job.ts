/*
 * What the browser extension hands over, checked before it is believed.
 *
 * This arrives by window.postMessage from a content script, which means it is
 * shaped by whatever was on a third party's page — a job title is somebody
 * else's HTML, and the description is an entire advert scraped from a board
 * that has no obligation to us. So nothing here is trusted: every field is
 * re-read, trimmed and capped, and a payload that cannot make a saveable role
 * is rejected with a reason a person can act on rather than a validation error.
 *
 * The caps match what the save endpoint accepts, so a role is never accepted
 * here only to be refused one call later.
 */

export type ImportedJob = {
  title: string;
  employer: string;
  location: string;
  /** Empty when the page was not on https, which the save endpoint refuses. */
  sourceUrl: string;
  description: string;
  /** Context about the competition, shown at import and not stored. */
  applicants: string;
  hiringManager: string;
  /** How the extension read the page, so a wrong capture is explainable. */
  readBy: string;
};

export type ImportedJobResult =
  | { ok: true; job: ImportedJob }
  | { ok: false; reason: string };

/** The save endpoint's own floor. Less than this is not an advert. */
export const MIN_IMPORT_DESCRIPTION = 120;
const MAX_DESCRIPTION = 80_000;
const MAX_FIELD = 240;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/*
 * The description keeps its line breaks — they are what separates one
 * requirement from the next, and flattening them turns a bulleted list into a
 * paragraph that the requirement reader cannot split apart again.
 */
function body(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_DESCRIPTION);
}

/*
 * Only https reaches the save endpoint, which is deliberate there: a source
 * link is something a person clicks months later, and it should not be able to
 * be a javascript: or file: URL stored on their behalf. A capture from an
 * http page is still saved — it just loses the link, rather than the role.
 */
function sourceUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && value.trim().length <= 2000 ? url.toString() : "";
  } catch {
    return "";
  }
}

export function parseImportedJob(payload: unknown): ImportedJobResult {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "Sartho could not read what the extension sent." };
  }

  const input = payload as Record<string, unknown>;
  const description = body(input.description);
  const title = text(input.title, MAX_FIELD);

  /*
   * Two failures worth telling apart, because the fix is different. No title
   * means the capture landed on the wrong part of the page; a short description
   * usually means the advert was still behind a "see more" link.
   */
  if (title.length < 2) {
    return { ok: false, reason: "The extension could not find a job title on that page. Open the advert itself and send it again." };
  }
  if (description.length < MIN_IMPORT_DESCRIPTION) {
    return { ok: false, reason: "That page had too little of the job description on it. Expand the full advert and send it again." };
  }

  return {
    ok: true,
    job: {
      title,
      employer: text(input.company ?? input.employer, MAX_FIELD),
      location: text(input.location, MAX_FIELD),
      sourceUrl: sourceUrl(input.url ?? input.sourceUrl),
      description,
      applicants: text(input.applicants, 120),
      hiringManager: text(input.hiringManager, 120),
      readBy: text(input.readBy, 60),
    },
  };
}
