-- How much experience the person has, as their own answer rather than an
-- inference from their résumé.
--
-- The number was already being derived — profiles.total_experience_years, read
-- off an imported document — and used to decide which roles are too senior to
-- show. Two problems with that as the only source. It is often absent, in which
-- case the search behaves as though the person has none. And it is not
-- correctable: somebody whose résumé parsed badly had no way to say so, and
-- every search afterwards was filtered against a number they never gave.
--
-- Stored as one of four band ids ('0-1', '2-5', '5-10', '10+') rather than a
-- number, because nobody knows their own total to the year and asking for one
-- produces a confident-looking guess. Null means never answered, which is not
-- the same as zero and is treated differently.

begin;

alter table public.search_preferences
  add column if not exists experience_level text;

comment on column public.search_preferences.experience_level is
  'Years of experience as a band: 0-1, 2-5, 5-10, 10+. Null means the person has not said, and the resume-derived total is used instead.';

-- Only the four the picker offers. A value outside them would be read as "not
-- answered" by the application anyway; refusing it here keeps the two in step.
alter table public.search_preferences
  drop constraint if exists search_preferences_experience_level_check;
alter table public.search_preferences
  add constraint search_preferences_experience_level_check
  check (experience_level is null or experience_level in ('0-1', '2-5', '5-10', '10+'));

commit;
