-- Search is per user, per market — not per deployment.
--
-- Country used to be a single environment setting, so every user searched the
-- same market. It now lives on the user's search preferences (their chosen
-- target job market), with the résumé-inferred country kept on the profile as
-- the pre-filled default they confirm. Target companies get their own column
-- instead of being crammed into the locations list.

alter table public.search_preferences
  add column if not exists country text,
  add column if not exists target_companies text[] not null default '{}';

comment on column public.search_preferences.country is
  'ISO-3166 alpha-2 code of the job market the user chose to search (e.g. au, in, sg).';
comment on column public.search_preferences.target_companies is
  'Employers the user wants roles at; each becomes a targeted search.';

alter table public.profiles
  add column if not exists country text;

comment on column public.profiles.country is
  'ISO-3166 alpha-2 country inferred from the résumé at import; the default offered on Search Brief.';
