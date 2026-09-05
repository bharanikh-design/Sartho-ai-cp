-- Regenerate destroyed the draft it replaced.
--
-- save_resume_draft ended with `on conflict (user_id, job_id) do update set
-- resume_draft = excluded.resume_draft`. One row per job, overwritten in place.
-- So pressing Regenerate — the obvious thing to do after reading an ATS score
-- you want to improve — threw away the version you already had, with no warning
-- and no way back. That is data loss in production, not a missing feature.
--
-- Every draft is now kept. The applications row stays exactly as it was and
-- remains the current version, so nothing that reads it changes; the history
-- lives beside it and is written on the way through.

begin;

create table if not exists public.resume_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  -- Counts from 1 per job, so a person can talk about "version 3" and mean it.
  version_number integer not null,
  version_name text,
  draft text not null,
  change_log jsonb not null default '[]'::jsonb,
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, version_number)
);

comment on table public.resume_versions is
  'Every résumé draft ever generated for a role, oldest first. The applications row holds the current one.';

create index if not exists resume_versions_job_idx
  on public.resume_versions (job_id, version_number desc);

alter table public.resume_versions enable row level security;

drop policy if exists "own resume versions" on public.resume_versions;
create policy "own resume versions"
  on public.resume_versions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Insert and select only. A version is a historical fact: editing or deleting
-- one would make the history a worse record than no history at all.
grant select, insert on table public.resume_versions to authenticated;

-- Backfill, so the draft someone is looking at right now becomes version 1
-- rather than appearing after a version 2 that came from nowhere.
insert into public.resume_versions (user_id, job_id, version_number, version_name, draft, change_log, evidence_ids, created_at)
select
  a.user_id,
  a.job_id,
  1,
  a.resume_version,
  a.resume_draft,
  coalesce(a.resume_change_log, '[]'::jsonb),
  coalesce(a.resume_evidence_ids, '[]'::jsonb),
  coalesce(a.resume_generated_at, a.updated_at, now())
from public.applications a
where a.resume_draft is not null
on conflict (job_id, version_number) do nothing;

create or replace function public.save_resume_draft(
  p_job_id uuid,
  p_resume_version text,
  p_resume_draft text,
  p_change_log jsonb,
  p_evidence_ids jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_application_id uuid;
  v_version integer;
begin
  if not exists (
    select 1 from public.jobs where id = p_job_id and user_id = auth.uid()
  ) then
    raise exception 'Job not found or access denied';
  end if;

  -- History first: if this insert fails the previous draft is still intact,
  -- which is the whole point of the change.
  select coalesce(max(version_number), 0) + 1
    into v_version
    from public.resume_versions
   where job_id = p_job_id;

  insert into public.resume_versions (
    user_id, job_id, version_number, version_name, draft, change_log, evidence_ids
  )
  values (
    auth.uid(),
    p_job_id,
    v_version,
    p_resume_version,
    p_resume_draft,
    coalesce(p_change_log, '[]'::jsonb),
    coalesce(p_evidence_ids, '[]'::jsonb)
  );

  insert into public.applications (
    user_id,
    job_id,
    status,
    resume_version,
    resume_draft,
    resume_change_log,
    resume_evidence_ids,
    resume_generated_at
  )
  values (
    auth.uid(),
    p_job_id,
    'analysed',
    p_resume_version,
    p_resume_draft,
    coalesce(p_change_log, '[]'::jsonb),
    coalesce(p_evidence_ids, '[]'::jsonb),
    now()
  )
  on conflict (user_id, job_id)
  do update set
    resume_version = excluded.resume_version,
    resume_draft = excluded.resume_draft,
    resume_change_log = excluded.resume_change_log,
    resume_evidence_ids = excluded.resume_evidence_ids,
    resume_generated_at = excluded.resume_generated_at
  returning id into v_application_id;

  return v_application_id;
end;
$$;

revoke all on function public.save_resume_draft(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_resume_draft(uuid, text, text, jsonb, jsonb) to authenticated;

-- Delete-my-data has to reach the new table too, or "wipe everything" quietly
-- leaves every résumé draft behind.
create or replace function public.wipe_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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
