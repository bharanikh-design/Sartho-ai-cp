begin;

create extension if not exists "pgcrypto";

alter table public.profiles
  add column if not exists summary text,
  add column if not exists strengths jsonb not null default '[]'::jsonb,
  add column if not exists exclusions jsonb not null default '[]'::jsonb;

alter table public.evidence_items
  add column if not exists external_key text,
  add column if not exists period_label text;

alter table public.jobs
  add column if not exists rule_analysis jsonb,
  add column if not exists deep_analysis_status text not null default 'not_started',
  add column if not exists deep_analysis_summary jsonb,
  add column if not exists deep_analysed_at timestamptz;

alter table public.job_requirements
  add column if not exists rationale text;

alter table public.applications
  add column if not exists resume_draft text,
  add column if not exists resume_change_log jsonb not null default '[]'::jsonb,
  add column if not exists resume_evidence_ids jsonb not null default '[]'::jsonb,
  add column if not exists resume_generated_at timestamptz;

create unique index if not exists target_lanes_user_name_uidx
  on public.target_lanes(user_id, name);
create unique index if not exists evidence_items_user_external_key_uidx
  on public.evidence_items(user_id, external_key)
  where external_key is not null;
create unique index if not exists applications_user_job_uidx
  on public.applications(user_id, job_id);
create index if not exists jobs_user_status_idx on public.jobs(user_id, status);
create index if not exists jobs_user_updated_idx on public.jobs(user_id, updated_at desc);
create index if not exists evidence_user_status_idx on public.evidence_items(user_id, approval_status);
create index if not exists requirements_job_type_idx on public.job_requirements(job_id, requirement_type);

alter table public.profiles enable row level security;
alter table public.target_lanes enable row level security;
alter table public.career_roles enable row level security;
alter table public.evidence_items enable row level security;
alter table public.jobs enable row level security;
alter table public.job_requirements enable row level security;
alter table public.applications enable row level security;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'jobs_status_check') then
    alter table public.jobs add constraint jobs_status_check check (
      status in ('saved','analysed','approved','applied','acknowledged','assessment','interview','offer','rejected','withdrawn')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'jobs_deep_analysis_status_check') then
    alter table public.jobs add constraint jobs_deep_analysis_status_check check (
      deep_analysis_status in ('not_started','processing','complete','failed')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'job_requirements_assessment_check') then
    alter table public.job_requirements add constraint job_requirements_assessment_check check (
      assessment in ('met','partially_met','not_met','unknown')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'applications_status_check') then
    alter table public.applications add constraint applications_status_check check (
      status in ('saved','analysed','approved','applied','acknowledged','assessment','interview','offer','rejected','withdrawn')
    );
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists evidence_items_set_updated_at on public.evidence_items;
create trigger evidence_items_set_updated_at before update on public.evidence_items
for each row execute function public.set_updated_at();

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at before update on public.jobs
for each row execute function public.set_updated_at();

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at before update on public.applications
for each row execute function public.set_updated_at();

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "own target lanes" on public.target_lanes;
create policy "own target lanes" on public.target_lanes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own career roles" on public.career_roles;
create policy "own career roles" on public.career_roles
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own evidence" on public.evidence_items;
create policy "own evidence" on public.evidence_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own jobs" on public.jobs;
create policy "own jobs" on public.jobs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own job requirements" on public.job_requirements;
create policy "own job requirements" on public.job_requirements
  for all to authenticated
  using (
    exists (
      select 1 from public.jobs j
      where j.id = job_requirements.job_id and j.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_requirements.job_id and j.user_id = auth.uid()
    )
  );

drop policy if exists "own applications" on public.applications;
create policy "own applications" on public.applications
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.replace_job_requirements(
  p_job_id uuid,
  p_requirements jsonb,
  p_summary jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.jobs where id = p_job_id and user_id = auth.uid()
  ) then
    raise exception 'Job not found or access denied';
  end if;

  delete from public.job_requirements where job_id = p_job_id;

  insert into public.job_requirements (
    job_id,
    requirement_text,
    requirement_type,
    category,
    matched_evidence_ids,
    assessment,
    confidence,
    rationale
  )
  select
    p_job_id,
    item.requirement_text,
    item.requirement_type,
    item.category,
    coalesce(item.matched_evidence_ids, '[]'::jsonb),
    item.assessment,
    item.confidence,
    item.rationale
  from jsonb_to_recordset(p_requirements) as item(
    requirement_text text,
    requirement_type text,
    category text,
    matched_evidence_ids jsonb,
    assessment text,
    confidence text,
    rationale text
  );

  update public.jobs
  set deep_analysis_status = 'complete',
      deep_analysis_summary = p_summary,
      deep_analysed_at = now(),
      status = case when status = 'saved' then 'analysed' else status end
  where id = p_job_id and user_id = auth.uid();
end;
$$;

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
begin
  if not exists (
    select 1 from public.jobs where id = p_job_id and user_id = auth.uid()
  ) then
    raise exception 'Job not found or access denied';
  end if;

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

create or replace function public.wipe_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.applications where user_id = auth.uid();
  delete from public.jobs where user_id = auth.uid();
  delete from public.evidence_items where user_id = auth.uid();
  delete from public.career_roles where user_id = auth.uid();
  delete from public.target_lanes where user_id = auth.uid();
  delete from public.profiles where id = auth.uid();
end;
$$;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.wipe_my_data() from public;
revoke all on function public.delete_my_account() from public;
grant execute on function public.wipe_my_data() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.replace_job_requirements(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.save_resume_draft(uuid, text, text, jsonb, jsonb) to authenticated;

commit;
