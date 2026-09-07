/*
 * Finding somebody's résumé in their Drive, and working out which one is
 * current.
 *
 * The problem this exists for: almost nobody knows which file is the real one.
 * There is a `Resume_final_v3.docx` in one folder, something a recruiter
 * edited in another, and a Google Doc from eighteen months ago. "Upload your
 * CV" puts that archaeology on the person at the worst possible moment.
 *
 * So Sartho looks, and — more usefully — says when each one was last touched,
 * because that is the fact people are actually missing. It never picks. A
 * product that silently chose the wrong CV and built a job search on it would
 * be worse than one that asked.
 */

/** What Drive calls the file types the résumé reader can actually handle. */
const MIME_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  gdoc: "application/vnd.google-apps.document",
  txt: "text/plain",
} as const;

export type DriveCandidate = {
  id: string;
  name: string;
  mimeType: string;
  /** ISO timestamp. The whole reason this feature is useful. */
  modifiedTime: string;
  sizeBytes: number | null;
  /** True for a Google Doc, which has to be exported rather than downloaded. */
  isGoogleDoc: boolean;
  /** Where it lives, so two files with the same name are tellable apart. */
  folder: string | null;
};

/*
 * The words people actually name these files.
 *
 * "cv" is matched as a whole word only, elsewhere — as a substring it hits
 * every file with "cv" inside a longer word, and Drive's `contains` has no
 * word boundaries, so that filtering happens after the query comes back.
 */
const NAME_TERMS = ["resume", "résumé", "cv", "curriculum vitae"];

/*
 * The Drive query.
 *
 * Name matches only, not full text. Full-text search would return every cover
 * letter, every job description somebody saved, and every reference — files
 * that mention a résumé rather than being one. Precision matters far more than
 * recall here: a list of six plausible files is useful, and a list of ninety
 * is the same problem the person already had.
 */
export function buildDriveQuery(): string {
  const names = NAME_TERMS.map((term) => `name contains '${term}'`).join(" or ");
  const types = Object.values(MIME_TYPES).map((mime) => `mimeType = '${mime}'`).join(" or ");
  /* Trashed files are still returned by default, and a deleted CV is deleted. */
  return `trashed = false and (${names}) and (${types})`;
}

type DriveFile = {
  id?: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
};

/*
 * A file whose name contains "cv" only as part of another word is not a CV.
 *
 * Drive's `contains` is a substring match, so the query above returns
 * "archive.pdf", "Invoices.docx" and anything else with those two letters in
 * it. Re-checking on this side is what keeps the list short enough to read.
 */
export function looksLikeResume(name: string): boolean {
  const lower = name.toLowerCase();
  if (/(resume|résumé|curriculum\s*vitae)/.test(lower)) return true;
  /* "cv" bounded by anything that is not a letter — cv_2024, my-cv, CV (1).pdf */
  return /(^|[^a-z])cv([^a-z]|$)/.test(lower);
}

export function readCandidates(files: DriveFile[], folders: Map<string, string> = new Map()): DriveCandidate[] {
  const candidates: DriveCandidate[] = [];
  for (const file of files) {
    if (!file.id || !file.name || !file.mimeType) continue;
    if (!looksLikeResume(file.name)) continue;
    const size = Number(file.size);
    candidates.push({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      modifiedTime: file.modifiedTime ?? "",
      /* A Google Doc reports no size — it has no bytes until it is exported. */
      sizeBytes: Number.isFinite(size) && size > 0 ? size : null,
      isGoogleDoc: file.mimeType === MIME_TYPES.gdoc,
      folder: file.parents?.[0] ? folders.get(file.parents[0]) ?? null : null,
    });
  }
  return sortByRecency(candidates);
}

/*
 * Newest first, which is the one thing the person came here to learn.
 *
 * A file with no modified time sorts last rather than first. Missing metadata
 * is not evidence of being current, and putting an unknown at the top of a
 * list headed "most recently edited" would be a claim Sartho cannot support.
 */
export function sortByRecency(candidates: DriveCandidate[]): DriveCandidate[] {
  return [...candidates].sort((a, b) => {
    const at = Date.parse(a.modifiedTime);
    const bt = Date.parse(b.modifiedTime);
    if (!Number.isFinite(at) && !Number.isFinite(bt)) return a.name.localeCompare(b.name);
    if (!Number.isFinite(at)) return 1;
    if (!Number.isFinite(bt)) return -1;
    return bt - at;
  });
}

/* Enough to choose from; more than this and the list is the problem again. */
export const MAX_CANDIDATES = 12;

export async function searchDrive(accessToken: string): Promise<DriveCandidate[]> {
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", buildDriveQuery());
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("pageSize", "100");
  url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime,size,parents)");
  /* Files shared with the person are theirs to use too. */
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("includeItemsFromAllDrives", "true");
  url.searchParams.set("corpora", "allDrives");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Drive returned ${response.status}.`);
  const body = (await response.json()) as { files?: DriveFile[] };
  return readCandidates(body.files ?? []).slice(0, MAX_CANDIDATES);
}

/*
 * The bytes of one file.
 *
 * A Google Doc has none until it is exported, so it goes out through a
 * different endpoint and comes back as a .docx — which the résumé reader
 * already handles, so nothing downstream needs to know the difference.
 */
export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
  isGoogleDoc: boolean,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const url = isGoogleDoc
    ? new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export`)
    : new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  if (isGoogleDoc) url.searchParams.set("mimeType", MIME_TYPES.docx);
  else url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Drive returned ${response.status}.`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType: isGoogleDoc ? MIME_TYPES.docx : response.headers.get("content-type") || "application/octet-stream",
  };
}

/*
 * A Google Doc exported as .docx needs a filename that says so, or the résumé
 * reader picks its parser from an extension that is not there.
 */
export function downloadFileName(name: string, isGoogleDoc: boolean): string {
  if (!isGoogleDoc) return name;
  return /\.docx$/i.test(name) ? name : `${name}.docx`;
}
