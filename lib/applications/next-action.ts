/*
 * What a person said they would do next on an application.
 *
 * `applications.next_action` and `next_action_date` have been in the schema
 * since the beginning and the Command Centre has always read them — the first
 * active application carrying a next action becomes the headline follow-up.
 * Nothing could write one, so that branch never fired and the dashboard said
 * "Review N active applications" forever.
 *
 * The rules live here rather than in the route handler so they can be tested
 * without standing up a request.
 */

export type NextAction = {
  nextAction: string | null;
  nextActionDate: string | null;
};

/**
 * A real calendar day in `YYYY-MM-DD`, which is what a Postgres `date` holds.
 *
 * The shape is checked by round-trip rather than by pattern alone: `2026-02-31`
 * and `2026-13-01` both match a `\d{4}-\d{2}-\d{2}` regex, and both are parsed
 * by Date into some other day entirely. Comparing the parse back to the input
 * is what actually rejects them.
 */
export function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * The pair as it should be stored.
 *
 * Two rules, both about not putting something on the dashboard that cannot be
 * acted on. Whitespace is not an action, so it clears rather than saves; and a
 * date with no action attached is a deadline for nothing, so it goes with it.
 * Clearing is deliberately possible — a follow-up that has been done needs to
 * stop being the headline.
 */
export function normaliseNextAction(action: string | null, date: string | null): NextAction {
  const nextAction = action?.trim() || null;
  if (!nextAction) return { nextAction: null, nextActionDate: null };
  return {
    nextAction,
    nextActionDate: date && isCalendarDay(date) ? date : null,
  };
}
