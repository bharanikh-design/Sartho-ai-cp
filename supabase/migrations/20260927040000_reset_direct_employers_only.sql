begin;

/*
 * "Direct employers only", reset so it is opted into rather than inherited.
 *
 * The toggle has been stored since 20260923010000 and has never changed a
 * single result. Its whole implementation was removing listings that led to
 * a search results page, and that removal was made unconditional — it is not
 * a preference; a card leading to a search box is not a vacancy — which left
 * the column recording a choice that did nothing.
 *
 * It now means something: hide roles you would apply for through a job board
 * rather than on the employer's own site or in their hiring system. That is a
 * real filter that can genuinely shorten a page, and the people who set this
 * flag agreed to the old sentence, which promised something else entirely:
 *
 *   'When true, search results are limited to vacancies verified on the
 *    employer own careers channel.'
 *
 * Leaving their stored `true` in place would switch a lossy filter on for
 * them without asking. That matters most where nobody is looking: the
 * scheduled alert mailer runs the same search (app/api/cron/match-alerts),
 * so an inherited `true` could quietly thin somebody's alert emails, or stop
 * them, with no page in front of them to explain why.
 *
 * WHY THIS LOSES NOTHING.
 *
 * Because the old setting had no effect, a person who set it has been seeing
 * exactly the results they would see with it off. Resetting restores the
 * experience they have actually been having, rather than taking a preference
 * away — there is no behaviour here to preserve. The toggle is still in the
 * brief editor, now describing what it really does, and one click switches it
 * back on knowing that.
 *
 * ORDERING. Apply this with or before the deploy that ships the filter. Run
 * afterwards and anybody holding a stored `true` gets the strict filter in
 * the interval, which is the whole thing this avoids.
 */
update public.search_preferences
set direct_employers_only = false
where direct_employers_only;

comment on column public.search_preferences.direct_employers_only is
  'When true, hides roles whose application goes through a job board rather than the employer''s own site or applicant tracking system. Reset once in 20260927040000, when the flag stopped being decorative and started filtering.';

/*
 * Idempotent: a second run matches no rows, and a person who has since opted
 * in deliberately is not affected by a run that already happened.
 */

commit;
