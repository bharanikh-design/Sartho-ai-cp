-- What Sartho is connected to on somebody's behalf, and the grant that lets it.
--
-- One row per person per provider. It holds an OAuth refresh token, which is a
-- long-lived key to somebody's Google Drive — the most sensitive thing this
-- database will ever store.
--
-- So the rule here is different from every other table: RLS is enabled and NO
-- POLICY IS CREATED. That is not an omission. With RLS on and no policy, the
-- anon and authenticated roles can read nothing at all, which means a stolen
-- session, a mistaken client-side `select("*")`, or a future bug in some other
-- route cannot put a refresh token in a browser. Only the service role — which
-- exists solely on the server and is never sent to a client — can reach it.
--
-- The consequence is deliberate: every read and write goes through a server
-- route that has already checked who is asking. There is no client shortcut,
-- and there should not be one.

begin;

create table if not exists public.integration_connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 'google' today. A text column rather than an enum so adding a provider is
  -- a deploy, not a migration with a lock on it.
  provider text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  -- What was actually granted, which is not always what was asked for: Google
  -- lets somebody untick a scope on the consent screen, and the difference has
  -- to be visible rather than discovered as a 403 later.
  scopes text[] not null default '{}',
  -- Shown on the Integrations page so a person can tell which account this is.
  -- Nobody remembers which of their three Google accounts they clicked.
  account_email text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.integration_connections enable row level security;

-- Deliberately no policies. See the note above: this table is server-only.

comment on table public.integration_connections is
  'OAuth grants Sartho holds on a user''s behalf. RLS is enabled with no policies on purpose: only the service role may read this, so a refresh token can never reach a browser.';
comment on column public.integration_connections.refresh_token is
  'Long-lived credential. Never returned by any API route, never logged, and never sent to a client.';

create index if not exists integration_connections_user_idx
  on public.integration_connections (user_id);

-- Erasing everything has to erase this too.
--
-- Rewritten in full rather than patched, and every existing line is carried
-- over deliberately: this function is the in-product "delete all my data"
-- path, and a table missing from it is data somebody believes they deleted.
create or replace function public.wipe_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.integration_connections where user_id = auth.uid();
  delete from public.user_activity where user_id = auth.uid();
  delete from public.search_results where user_id = auth.uid();
  delete from public.direction_suggestion_sets where user_id = auth.uid();
  delete from public.seen_job_matches where user_id = auth.uid();
  delete from public.ai_usage_events where user_id = auth.uid();
  delete from public.resume_versions where user_id = auth.uid();
  delete from public.applications where user_id = auth.uid();
  delete from public.jobs where user_id = auth.uid();
  delete from public.evidence_items where user_id = auth.uid();
  delete from public.career_roles where user_id = auth.uid();
  delete from public.target_lanes where user_id = auth.uid();
  delete from public.resume_imports where user_id = auth.uid();
  delete from public.profiles where id = auth.uid();
end;
$$;

revoke all on function public.wipe_my_data() from public, anon;
grant execute on function public.wipe_my_data() to authenticated;

commit;
