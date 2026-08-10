begin;

create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 320),
  daily_digest_enabled boolean not null default false,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "own notification preferences" on public.notification_preferences;
create policy "own notification preferences"
  on public.notification_preferences
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.notification_preferences to authenticated;

commit;
