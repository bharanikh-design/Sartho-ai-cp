create table if not exists public.search_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_locations text[] not null default '{}',
  remote_preference text,
  sources jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.search_preferences enable row level security;

drop policy if exists "own search preferences" on public.search_preferences;
create policy "own search preferences" on public.search_preferences
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.search_preferences from anon;
grant select, insert, update, delete on table public.search_preferences to authenticated;
