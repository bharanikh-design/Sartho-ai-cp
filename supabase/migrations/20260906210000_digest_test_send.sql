-- Being able to answer "is the daily summary actually being sent?"
--
-- Right now nothing in the product can. Match alerts show their last scheduled
-- run and offer a test send; the daily digest offers neither, so the only way
-- to find out was to wait until midnight and watch an inbox. That is a poor way
-- to learn that a scheduled job has been returning 401 for a month.
--
-- The digest already records last_sent_at, written by the cron. What is missing
-- is somewhere to record a test send, and it has to be a separate column:
-- writing a test into last_sent_at would make the real run skip that person for
-- the next twenty hours, so proving delivery works would stop it working.

begin;

alter table public.notification_preferences
  add column if not exists daily_digest_last_test_at timestamptz;

comment on column public.notification_preferences.daily_digest_last_test_at is
  'When this person last sent themselves a test digest. Deliberately not last_sent_at, which the scheduled run reads to decide who is due.';

commit;
