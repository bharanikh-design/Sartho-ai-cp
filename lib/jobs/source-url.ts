/*
 * Is this the same advert I already saved?
 *
 * It has to be, because the browser extension makes saving a role one click
 * from a job board, and one click is easy to do twice. Without an answer to
 * this question the pipeline fills with the same LinkedIn posting three times
 * and stops being a record of anything.
 *
 * The URL is the only identifier a job board gives us, and it is a poor one
 * straight out of the address bar. The same advert reached from a search, from
 * an email alert and from a colleague's link carries three different query
 * strings, all of them tracking:
 *
 *   linkedin.com/jobs/view/4012345678/?refId=xY9&trackingId=abc%3D%3D
 *   linkedin.com/jobs/view/4012345678/?eBP=NOT_ELIGIBLE&trk=flagship_job
 *
 * So the comparison is made on a canonical form: the identifying parts kept,
 * the tracking thrown away. Which parts identify differs by site and cannot be
 * guessed — Indeed's `jk` parameter *is* the advert, so a rule that strips
 * every query string would collapse every Indeed job into one.
 */

/*
 * Parameters that never identify an advert anywhere.
 *
 * Kept deliberately short and specific. A broad rule — "drop everything that
 * looks like tracking" — eventually eats an identifier on some site nobody
 * tested, and merging two different jobs into one row is far worse than
 * keeping a duplicate: it silently overwrites what the person saved.
 */
const TRACKING_PARAMS = new Set([
  "refid", "trackingid", "trk", "trkinfo", "originaltrk", "ebp",
  "position", "pagenum", "seniority", "recommendedflavour", "lipi",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "gclid", "fbclid", "msclkid", "mc_cid", "mc_eid",
  "src", "source", "ref", "referrer", "from", "cid", "sid",
]);

/*
 * Sites where the query string carries the advert's identity, and which
 * parameter does it. Everything else on these hosts is still dropped.
 */
const IDENTIFYING_PARAMS: Record<string, string[]> = {
  "indeed.com": ["jk", "vjk"],
  "seek.com.au": ["jobid"],
  "glassdoor.com": ["joblistingid"],
  "ziprecruiter.com": ["lvk"],
  "naukri.com": ["jobid"],
};

function hostKey(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  for (const key of Object.keys(IDENTIFYING_PARAMS)) {
    if (host === key || host.endsWith(`.${key}`)) return key;
  }
  return null;
}

/**
 * The comparable form of a job advert's URL, or null when it is not a URL we
 * can compare at all. Never throws: this runs on whatever the address bar had.
 */
export function canonicalJobUrl(raw: string | null | undefined): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  /*
   * Scheme and host are normalised but not equated: http and https are folded
   * together because a board serving both is serving one advert, and the "www."
   * prefix is dropped for the same reason.
   */
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  /* A trailing slash is not a different advert. */
  const path = url.pathname.replace(/\/+$/, "") || "/";

  const identifying = hostKey(host);
  const keep: string[] = [];
  if (identifying) {
    const wanted = IDENTIFYING_PARAMS[identifying].map((name) => name.toLowerCase());
    for (const [name, value] of url.searchParams) {
      const key = name.toLowerCase();
      if (wanted.includes(key) && value.trim()) keep.push(`${key}=${value.trim()}`);
    }
    keep.sort();
  } else {
    /*
     * On an unknown host the query may well be the advert — a careers page at
     * /jobs?id=482 is ordinary — so anything not on the tracking list is kept.
     * Sorted, because parameter order is not identity.
     */
    for (const [name, value] of url.searchParams) {
      const key = name.toLowerCase();
      if (TRACKING_PARAMS.has(key)) continue;
      if (!value.trim()) continue;
      keep.push(`${key}=${value.trim()}`);
    }
    keep.sort();
  }

  const query = keep.length ? `?${keep.join("&")}` : "";
  /* The fragment is never part of an advert's identity. */
  return `https://${host}${path}${query}`;
}

/** Whether two job URLs point at the same advert. */
export function isSameJobUrl(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = canonicalJobUrl(a);
  const right = canonicalJobUrl(b);
  return Boolean(left && right && left === right);
}
