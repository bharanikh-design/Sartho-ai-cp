-- The queries every page load makes, given somewhere to look.
--
-- target_lanes and career_roles have carried `id` as their primary key since
-- the first schema, and user_id with no index at all. Every render of the
-- navigation rail reads both by user_id — loadProductJourneyStatus fires six
-- queries and two of them were sequential scans of the whole table. At one
-- user that is invisible; at a thousand it is the most frequent database work
-- the product does, and it is spent deciding which menu items to unlock.
--
-- The two cron predicates had the same problem from the other direction. Both
-- scheduled jobs filter notification_preferences on an enabled flag, and match
-- alerts then orders by match_alerts_last_run_at to pick up where the previous
-- run stopped — a scan plus a sort, every night, growing with the user base.
--
-- Partial indexes on the enabled flags because that is exactly what the crons
-- ask for and the false rows are dead weight in the index: someone who has not
-- opted in is never a row either job wants.
--
-- All four are `if not exists`, so re-running this migration is safe.

begin;

create index if not exists target_lanes_user_idx
  on public.target_lanes(user_id);

create index if not exists career_roles_user_idx
  on public.career_roles(user_id);

-- daily-digest: `.eq("daily_digest_enabled", true)`
create index if not exists notification_prefs_digest_enabled_idx
  on public.notification_preferences(user_id)
  where daily_digest_enabled;

-- match-alerts: `.eq("match_alerts_enabled", true).order("match_alerts_last_run_at")`
create index if not exists notification_prefs_alerts_due_idx
  on public.notification_preferences(match_alerts_last_run_at nulls first)
  where match_alerts_enabled;

commit;
