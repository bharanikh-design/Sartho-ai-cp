/*
 * What happened to the results you are looking at.
 *
 * `runBriefSearch` counts every advert it removes and every provider that
 * failed, writes all of it onto SearchCriteria, stores it, and hands it to the
 * search panel — which rendered the country, the employment types and the
 * provider badges, and nothing else. So a filter could quietly take half the
 * page away and the only visible evidence was a shorter list.
 *
 * The count beside `workModelHidden` in run-search.ts even says "Reported
 * because this filter was decorative until now: saying what it did is how that
 * stays visible." Nothing reported it.
 *
 * Two rules here. Silence when there is nothing to say — a note reading "0
 * hidden" is noise that teaches people to stop reading notes. And the
 * person's own filters come first, because those are the ones they can undo.
 */

export type SearchFilterNote = {
  /** Stable key for React, and for asserting on the right note in a test. */
  id: "direct-employers" | "work-model" | "provider-trouble";
  text: string;
};

type Diagnostics = {
  agencyOrUnverifiedHidden?: number;
  workModelHidden?: number;
  workModels?: string[];
  providerErrors?: string[];
};

const listing = (count: number) => `${count} listing${count === 1 ? "" : "s"}`;

/** A count that is actually a positive number, not NaN, undefined or noise. */
function shown(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? Math.floor(value as number) : 0;
}

/**
 * The notes worth putting under a set of results, in the order to read them.
 *
 * Only ever describes something that really happened on this run: each line is
 * driven by a count the search itself produced, so there is no case where this
 * claims a filter ran when it did not.
 */
export function searchFilterNotes(criteria: Diagnostics | null | undefined): SearchFilterNote[] {
  if (!criteria) return [];
  const notes: SearchFilterNote[] = [];

  const agency = shown(criteria.agencyOrUnverifiedHidden);
  if (agency) {
    notes.push({
      id: "direct-employers",
      text: `${listing(agency)} hidden — they led to a search results page rather than somewhere to apply. That is “Direct employers only” doing its job.`,
    });
  }

  const workModel = shown(criteria.workModelHidden);
  if (workModel) {
    const chosen = criteria.workModels?.length ? criteria.workModels.join(" or ") : "the pattern you chose";
    notes.push({
      id: "work-model",
      text: `${listing(workModel)} hidden — the advert stated a working pattern other than ${chosen}. Adverts that say nothing either way are kept.`,
    });
  }

  /*
   * Last, and phrased as a limit on the results rather than as an error,
   * because it is the one line here that is about Sartho rather than about
   * something the person asked for. A provider dropping out is otherwise
   * indistinguishable, from this page, from a market with nothing in it.
   *
   * These are whole sentences, not provider names. `errorsThatCostResults()`
   * returns what `record()` built — "Google for Jobs (SerpApi) is not
   * configured.", "Adzuna: 429 Too Many Requests" — already run through
   * `readable()` to strip a vendor's upsell link. Treating them as names
   * produced "Google for Jobs (SerpApi) is not configured. did not answer on
   * this run", so the diagnostics follow the sentence rather than being
   * conscripted into it.
   */
  const failed = (criteria.providerErrors ?? [])
    .filter((message): message is string => typeof message === "string" && Boolean(message.trim()))
    .map((message) => message.trim())
    /* Terminated so they read as sentences whichever way the provider phrased it. */
    .map((message) => (/[.!?]$/.test(message) ? message : `${message}.`));

  if (failed.length) {
    notes.push({
      id: "provider-trouble",
      text: `Not every source answered on this run, so there may be more out there than you can see here. ${[...new Set(failed)].join(" ")}`,
    });
  }

  return notes;
}
