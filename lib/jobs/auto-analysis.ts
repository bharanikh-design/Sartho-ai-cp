/*
 * What happens to a role the moment it lands from the browser extension.
 *
 * Saving a role scores it on keywords — fast, free, and shallow. The grounded
 * analysis, which reads every requirement in the advert and answers it against
 * approved evidence, sat behind a button on a page nobody had opened yet. So
 * the feature that is the actual product was the one step a person had to know
 * to take, and a role sent from LinkedIn arrived with a keyword guess beside it.
 *
 * Now the send does the whole job: captured, saved, and analysed, with the
 * result on screen before the person has left the tab. This file is the part of
 * that worth testing on its own — when to spend an analysis, and how to say
 * plainly what happened when one is not spent.
 */

import type { DeepAnalysisSummary, JobRecord } from "@/lib/types";

/*
 * A role already carrying a completed analysis is left alone. A second capture
 * of the same advert is nearly always the same words, and re-reading them costs
 * a person's monthly allowance to print the answer they already have.
 */
export function shouldAutoAnalyse(job: Pick<JobRecord, "deep_analysis_status">): boolean {
  return job.deep_analysis_status !== "complete";
}

/**
 * Why no analysis came back, in words a person can act on. Every branch here is
 * a real response from the deep-analysis route, and none of them mean the role
 * failed to save — that distinction is the whole point of saying it separately.
 */
export function analysisSetback(status: number, error?: string | null): string {
  if (status === 400) {
    /* The route's own words: evidence has to be approved before it can be cited. */
    return error?.trim()
      || "Confirm your Career Profile evidence and Sartho can analyse this role against it.";
  }
  if (status === 429) {
    return error?.trim()
      || "Sartho's AI allowance is used up for now. Open the role to analyse it later.";
  }
  if (status === 401) {
    return "Sign in again to analyse this role.";
  }
  return error?.trim() || "Sartho saved the role but could not analyse it. Open it to try again.";
}

/**
 * The analysis in one line: coverage first, because how much of the advert a
 * person can actually answer is the question they sent the role over to ask.
 */
export function summariseAnalysis(summary: DeepAnalysisSummary): string {
  const parts: string[] = [];
  if (summary.mandatoryTotal > 0) {
    parts.push(`${summary.mandatoryMet} of ${summary.mandatoryTotal} must-haves evidenced`);
  }
  if (summary.preferredTotal > 0) {
    parts.push(`${summary.preferredMet} of ${summary.preferredTotal} nice-to-haves`);
  }
  const gaps = summary.honestGaps.length;
  if (gaps > 0) {
    parts.push(gaps === 1 ? "1 gap to close" : `${gaps} gaps to close`);
  }
  /*
   * An advert with no requirement the model could pin down is not a match of
   * zero — it is an advert that said nothing checkable, and saying so is more
   * honest than printing "0 of 0".
   */
  return parts.length ? parts.join(" · ") : "No checkable requirements found in this advert";
}
