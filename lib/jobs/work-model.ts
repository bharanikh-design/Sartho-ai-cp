/*
 * "How do you want to work?" — on-site, hybrid, remote, flexible.
 *
 * This was the most complete dead control on the Search Brief. The four
 * buttons were captured, persisted as `remote_preference`, carried through
 * candidate context into the search intent, reported back in the collapsed
 * brief summary and in the match-alert email as "remote only" — and never once
 * used to decide which jobs a person saw.
 *
 * Everything downstream collapsed to a single boolean:
 *
 *     const remoteOnly = preferences.length === 1 && preferences[0] === "Remote";
 *
 * So "On-site" and "Hybrid" had no code path at all, choosing both did exactly
 * what choosing nothing did, and even a lone "Remote" reached only two of the
 * three providers — not SerpApi, which leads the cascade and is what actually
 * answers. The help text under the buttons said "Remote asks providers for
 * remote-only listings", which was false for the provider that ran.
 *
 * Filtered after the fact rather than folded into the query, which is the
 * lesson SerpApi taught this codebase twice over: this is a search engine over
 * job titles, and every word added to a query is a word that must be matched.
 * "ServiceNow Delivery Director hybrid" finds nothing. Google already reports
 * the working pattern in the advert text, so the filter belongs after the
 * results, where it is a real filter rather than a hint and costs the query
 * nothing.
 */

export const WORK_MODELS = ["On-site", "Hybrid", "Remote", "Flexible"] as const;
export type WorkModel = (typeof WORK_MODELS)[number];

/*
 * How each working pattern is actually written in an advert. Matched loosely
 * because the spelling varies by market, and a hyphen should not lose a job.
 */
const WORK_MODEL_WORDS: Record<Exclude<WorkModel, "Flexible">, string[]> = {
  Remote: [
    "remote", "work from home", "working from home", "wfh", "telecommute",
    "home based", "home-based", "fully remote", "remote-first", "remote first",
  ],
  Hybrid: ["hybrid", "part remote", "partially remote", "split between home"],
  "On-site": [
    "on-site", "onsite", "on site", "in office", "in-office", "office based",
    "office-based", "fully on-site", "5 days in the office", "in person", "in-person",
  ],
};

/** Advert text flattened so a hyphen, a newline or a capital cannot hide a word. */
function flatten(text: string): string {
  return ` ${text.toLowerCase().replace(/[\s\-_/]+/g, " ").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

/**
 * The working patterns an advert explicitly states, which is often none.
 *
 * "Hybrid" is checked before "Remote" deliberately: a hybrid advert almost
 * always contains the word "remote" as well ("hybrid — 2 days remote"), and
 * reading that as a remote role is how a hybrid job ends up filtered out of an
 * on-site-and-hybrid search.
 */
export function detectWorkModels(text: string): WorkModel[] {
  const haystack = flatten(text);
  const found = new Set<WorkModel>();

  const says = (words: string[]) => words.some((word) => haystack.includes(` ${flatten(word).trim()} `));

  if (says(WORK_MODEL_WORDS.Hybrid)) found.add("Hybrid");
  if (says(WORK_MODEL_WORDS["On-site"])) found.add("On-site");
  /* A hybrid advert naming remote days is hybrid, not remote. */
  if (!found.has("Hybrid") && says(WORK_MODEL_WORDS.Remote)) found.add("Remote");

  return [...found];
}

/**
 * Keep the listings whose stated working pattern is one the person asked for.
 *
 * Three deliberate abstentions, all of which keep the role rather than drop it:
 *
 *   - Nothing selected is not a filter.
 *   - "Flexible" means the person is open, so selecting it filters nothing.
 *     A filter that hides jobs from somebody who said they are flexible would
 *     be the opposite of what they asked for.
 *   - An advert that states no working pattern is kept. Most state none, and
 *     dropping a job because its advert omitted a field would throw away far
 *     more than the filter could ever be worth — the same reasoning that keeps
 *     a listing with no reported schedule_type.
 *
 * Only an advert that states a pattern, and states none that was asked for, is
 * removed. And it never empties the page: a filter that leaves nothing is
 * worse than the listings it removed, so it stands down and reports that it
 * hid nothing.
 */
export function keepWorkModels<T>(
  items: T[],
  selected: string[],
  textOf: (item: T) => string,
): { kept: T[]; hidden: number } {
  const wanted = selected.filter((value): value is WorkModel =>
    (WORK_MODELS as readonly string[]).includes(value));

  if (!wanted.length || wanted.includes("Flexible") || wanted.length === WORK_MODELS.length) {
    return { kept: items, hidden: 0 };
  }

  const kept = items.filter((item) => {
    const stated = detectWorkModels(textOf(item));
    if (!stated.length) return true;
    return stated.some((model) => wanted.includes(model));
  });

  if (!kept.length) return { kept: items, hidden: 0 };
  return { kept, hidden: items.length - kept.length };
}
