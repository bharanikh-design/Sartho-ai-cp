alter table public.search_preferences
  add column if not exists direct_employers_only boolean not null default false;

comment on column public.search_preferences.direct_employers_only is
  'When true, search results are limited to vacancies verified on the employer own careers channel.';
