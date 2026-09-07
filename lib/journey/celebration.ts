import type { ProductJourneyStepId } from "@/lib/journey/product-journey";

/*
 * Marking the moment a step is finished.
 *
 * Uploading a résumé is the hardest thing Sartho asks of anybody — it is the
 * step where a person hands over their career and gets, at that instant,
 * nothing back. The product moved silently past it: the menu quietly unlocked,
 * and that was all. A person who has just done the work deserves to be told it
 * landed and what it bought them.
 *
 * Two rules keep this from becoming the confetti every product throws at you.
 *
 * It fires once, ever, per step. A celebration that reappears on every page
 * load is an interruption, and the second time somebody sees it they learn to
 * dismiss the thing without reading it.
 *
 * And it says something true and specific alongside the congratulations. "One
 * step closer" on its own is a greetings card; naming what the step actually
 * unlocked is the part worth reading, and it is the part that makes the next
 * step obvious.
 */

export type Celebration = {
  id: ProductJourneyStepId;
  /** The moment, in two or three words. */
  badge: string;
  headline: string;
  /** What this actually bought them. Never a claim the product cannot back. */
  detail: string;
  /** Where to go next, and what it is called. */
  ctaLabel: string;
  ctaHref: string;
};

const CELEBRATIONS: Record<ProductJourneyStepId, Omit<Celebration, "id">> = {
  resume: {
    badge: "Résumé uploaded",
    headline: "One step closer to your dream job.",
    detail: "Sartho has read your career into approved evidence. From here every match, every score and every résumé draft is grounded in what you have actually done — nothing invented.",
    ctaLabel: "Choose your target roles",
    ctaHref: "/career-direction",
  },
  direction: {
    badge: "Direction set",
    headline: "Sartho knows what you are aiming for.",
    detail: "Your target roles are what Sartho searches for, and what it measures every advert against. Roles in a different line of work will not crowd your list.",
    ctaLabel: "Find live roles",
    ctaHref: "/search-plan",
  },
  search: {
    badge: "Search brief saved",
    headline: "You are set up end to end.",
    detail: "Sartho can now search live listings in your markets and score each one against your evidence. Turn on email alerts and the strong matches come to you.",
    ctaLabel: "See your matches",
    ctaHref: "/search-plan",
  },
};

export type JourneyStepState = { id: string; complete: boolean };

/**
 * The one step worth celebrating right now, or nothing.
 *
 * Earliest first, so somebody who completes two steps between visits is
 * congratulated on the first and then, next time, the second — rather than
 * being shown two cards at once or having the earlier one silently skipped.
 */
export function nextCelebration(
  steps: JourneyStepState[],
  alreadyCelebrated: readonly string[],
): Celebration | null {
  const seen = new Set(alreadyCelebrated);

  for (const step of steps) {
    if (!step.complete) continue;
    if (seen.has(step.id)) continue;
    const copy = CELEBRATIONS[step.id as ProductJourneyStepId];
    /* A step with no copy is a step somebody added without deciding what it means. */
    if (!copy) continue;
    return { id: step.id as ProductJourneyStepId, ...copy };
  }

  return null;
}

/**
 * Steps already complete when somebody first arrives with no record.
 *
 * Without this, the day this ships every existing person is congratulated on
 * work they finished weeks ago — three cards in a row for a pipeline they have
 * been using since June. Their finished steps are marked as seen instead, and
 * only what they do from now on is celebrated.
 */
export function alreadyEarned(steps: JourneyStepState[]): string[] {
  return steps.filter((step) => step.complete).map((step) => step.id);
}
