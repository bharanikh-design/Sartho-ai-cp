/*
 * Reading the part of the advert that says who may apply.
 *
 * The experience filter was correct and blind. Adzuna's search API returns a
 * truncated snippet — the first couple of hundred characters, which is the
 * marketing paragraph — and every advert puts "SKILLS & EXPERIENCE: at least 3
 * years" much further down. So a graduate filter that reads the description was
 * reading the one part of the advert guaranteed not to contain the requirement,
 * and the roles it was built to remove sailed straight through.
 *
 * The listing page has the whole text. Fetching it is the only way to see the
 * requirement without changing provider, so that is what this does: best
 * effort, time-boxed, and never fatal. A page that will not load leaves the
 * role exactly as it was.
 *
 * Extraction is deliberately crude, because it does not need to be good. The
 * question asked of this text is "does it state a number of years near a word
 * about experience", not "render this nicely". Structured data is preferred
 * when the page publishes it, and stripped markup is a perfectly adequate
 * fallback for a regex.
 */

/** Long enough for any advert; short enough that a runaway page cannot hurt. */
const MAX_TEXT = 40_000;

/*
 * A stray "serving customers for 25 years" in a footer would be read as a
 * requirement by a naive reader. Two things make that safe rather than
 * theoretical: requiredExperienceIn only counts a number with an experience
 * word within 48 characters, and it takes the LOWEST figure in the document —
 * so a genuine "3 years" always beats a stray larger one, and the failure mode
 * is a role kept rather than a role wrongly removed.
 */
/*
 * Short enough to admit a terse advert, long enough to reject a cookie banner.
 * A one-line requirement is a requirement: "at least 4 years of experience in
 * audit" is 45 characters and is the entire reason this function exists.
 */
const MIN_USEFUL = 40;

export function extractAdvertText(html: string): string | null {
  if (typeof html !== "string" || html.length < MIN_USEFUL) return null;

  /*
   * Structured data wins whenever a board publishes it, because it is scoped
   * to the advert rather than the site around it — no navigation, no cookie
   * banner, no "25 years in business" in the footer.
   */
  const structured = fromJsonLd(html);
  if (structured && structured.length >= MIN_USEFUL) return structured.slice(0, MAX_TEXT);

  const stripped = stripMarkup(html);
  return stripped.length >= MIN_USEFUL ? stripped.slice(0, MAX_TEXT) : null;
}

/*
 * schema.org JobPosting, which most boards publish because Google requires it
 * to list a job. Cleaner than the page, and scoped to the advert rather than
 * the site around it.
 */
function fromJsonLd(html: string): string | null {
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  if (!blocks) return null;

  for (const block of blocks) {
    const json = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      continue; // a malformed block is not a reason to stop reading the page
    }

    const queue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      const record = node as Record<string, unknown>;
      if (Array.isArray(record["@graph"])) queue.push(...(record["@graph"] as unknown[]));

      const type = record["@type"];
      const types = Array.isArray(type) ? type : [type];
      const isPosting = types.some((entry) => typeof entry === "string" && entry.toLowerCase() === "jobposting");
      if (!isPosting) continue;

      const description = record.description;
      if (typeof description === "string" && description.trim()) return stripMarkup(description);
    }
  }
  return null;
}

/*
 * Markup out, words in. Script and style contents are removed rather than
 * stripped of tags, because their bodies are not prose and would otherwise be
 * searched for requirements.
 */
export function stripMarkup(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    /* Block ends become line breaks, so a bulleted requirement keeps its own line. */
    .replace(/<\/(p|div|li|br|h[1-6]|tr|section)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&#8217;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The advert's own page, or null.
 *
 * Never throws and never retries. This runs inside a live search with a wall
 * clock, and a role whose page will not load must cost nothing beyond the
 * timeout — the caller keeps the role and simply knows less about it.
 */
export async function fetchAdvertText(url: string, timeoutMs = 4_000): Promise<string | null> {
  if (!/^https?:\/\//i.test(url)) return null;

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        /*
         * Identified rather than disguised. A board that would rather Sartho
         * did not read its pages can say so, and this is the request they see.
         */
        "User-Agent": "SarthoBot/1.0 (+https://www.sartho.tech; job-requirement-check)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en",
      },
    });
    if (!response.ok) return null;

    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(type)) return null;

    return extractAdvertText(await response.text());
  } catch {
    return null;
  }
}
