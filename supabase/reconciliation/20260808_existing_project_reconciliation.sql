begin;

-- Existing-project reconciliation for the live Sartho Supabase project.
--
-- This is intentionally outside supabase/migrations. The project already has
-- user data but no Supabase migration history, so `supabase db push` would try
-- to replay older files. Run this package only after a verified backup and a
-- read-only preflight. It adds operational infrastructure; it never rewrites
-- or deletes career, résumé, job, application, profile or authentication data.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtext('sartho-existing-project-reconciliation-20260808')
);

-- Fail before changing anything if this is not the existing Sartho schema we
-- inspected. Because the whole package is transactional, any later failure
-- also rolls back every preceding statement.
do $$
declare
  v_missing text[];
  v_rls_disabled text[];
  v_bad_policies text[];
  v_missing_functions text[];
begin
  if pg_catalog.to_regclass('supabase_migrations.schema_migrations') is not null then
    raise exception 'Sartho reconciliation stopped; this project already has Supabase migration history';
  end if;

  select pg_catalog.array_agg(required.name order by required.name)
    into v_missing
  from (
    values
      ('public.profiles'),
      ('public.target_lanes'),
      ('public.career_roles'),
      ('public.evidence_items'),
      ('public.jobs'),
      ('public.job_requirements'),
      ('public.applications'),
      ('public.resume_imports')
  ) as required(name)
  where pg_catalog.to_regclass(required.name) is null;

  if v_missing is not null then
    raise exception 'Sartho reconciliation stopped; missing required tables: %', v_missing;
  end if;

  select pg_catalog.array_agg(required.name order by required.name)
    into v_rls_disabled
  from (
    values
      ('profiles'),
      ('target_lanes'),
      ('career_roles'),
      ('evidence_items'),
      ('jobs'),
      ('job_requirements'),
      ('applications'),
      ('resume_imports')
  ) as required(name)
  join pg_catalog.pg_class table_definition
    on table_definition.relnamespace = 'public'::pg_catalog.regnamespace
   and table_definition.relname = required.name
   and table_definition.relkind = 'r'
  where not table_definition.relrowsecurity;

  if v_rls_disabled is not null then
    raise exception 'Sartho reconciliation stopped; RLS is disabled on: %', v_rls_disabled;
  end if;

  select pg_catalog.array_agg(required.policy_name order by required.policy_name)
    into v_bad_policies
  from (
    values
      ('profiles', 'own profile'),
      ('target_lanes', 'own target lanes'),
      ('career_roles', 'own career roles'),
      ('evidence_items', 'own evidence'),
      ('jobs', 'own jobs'),
      ('job_requirements', 'own job requirements'),
      ('applications', 'own applications'),
      ('resume_imports', 'own resume imports')
  ) as required(table_name, policy_name)
  left join pg_catalog.pg_policies policy
    on policy.schemaname = 'public'
   and policy.tablename = required.table_name
   and policy.policyname = required.policy_name
   and policy.cmd = 'ALL'
   and policy.roles = array['authenticated']::name[]
  where policy.policyname is null;

  if v_bad_policies is not null then
    raise exception 'Sartho reconciliation stopped; required authenticated-only policies differ: %', v_bad_policies;
  end if;

  select pg_catalog.array_agg(required.signature order by required.signature)
    into v_missing_functions
  from (
    values
      ('public.replace_job_requirements(uuid,jsonb,jsonb)'),
      ('public.save_resume_draft(uuid,text,text,jsonb,jsonb)'),
      ('public.apply_resume_import(uuid,jsonb,jsonb)'),
      ('public.wipe_my_data()'),
      ('public.delete_my_account()')
  ) as required(signature)
  where pg_catalog.to_regprocedure(required.signature) is null;

  if v_missing_functions is not null then
    raise exception 'Sartho reconciliation stopped; missing required functions: %', v_missing_functions;
  end if;
end;
$$;

-- Temporary résumé bytes. The application and browser both attempt deletion
-- after extraction; the bucket remains private even if cleanup is interrupted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resume-uploads',
  'resume-uploads',
  false,
  8388608,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "upload own temporary resumes" on storage.objects;
create policy "upload own temporary resumes" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resume-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "read own temporary resumes" on storage.objects;
create policy "read own temporary resumes" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resume-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "delete own temporary resumes" on storage.objects;
create policy "delete own temporary resumes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'resume-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- Durable server-only usage ledger. No browser role can read or write it;
-- authenticated users can only ask the fixed-policy function for a decision.
create table if not exists public.ai_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null check (
    operation in ('resume_import', 'deep_analysis', 'resume_draft')
  ),
  units smallint not null check (units between 1 and 10),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events(user_id, created_at desc);
create index if not exists ai_usage_events_user_operation_created_idx
  on public.ai_usage_events(user_id, operation, created_at desc);

alter table public.ai_usage_events enable row level security;
revoke all on table public.ai_usage_events from public, anon, authenticated;

create or replace function public.consume_ai_quota(p_operation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_units integer;
  v_window interval;
  v_window_limit integer;
  v_window_used integer;
  v_month_used integer;
  v_month_limit constant integer := 100;
  v_retry_after integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  case p_operation
    when 'resume_import' then
      v_units := 3;
      v_window := interval '10 minutes';
      v_window_limit := 3;
    when 'deep_analysis' then
      v_units := 2;
      v_window := interval '10 minutes';
      v_window_limit := 5;
    when 'resume_draft' then
      v_units := 2;
      v_window := interval '10 minutes';
      v_window_limit := 5;
    else
      raise exception 'Unknown AI operation';
  end case;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_user_id::text));

  delete from public.ai_usage_events
  where user_id = v_user_id
    and created_at < pg_catalog.date_trunc('month', pg_catalog.now()) - interval '13 months';

  select count(*)::integer
    into v_window_used
  from public.ai_usage_events
  where user_id = v_user_id
    and operation = p_operation
    and created_at > pg_catalog.now() - v_window;

  if v_window_used >= v_window_limit then
    select greatest(
      1,
      ceil(extract(epoch from (min(created_at) + v_window - pg_catalog.now())))::integer
    )
      into v_retry_after
    from public.ai_usage_events
    where user_id = v_user_id
      and operation = p_operation
      and created_at > pg_catalog.now() - v_window;

    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limit',
      'retryAfterSeconds', v_retry_after,
      'remainingMonthlyUnits', null
    );
  end if;

  select coalesce(sum(units), 0)::integer
    into v_month_used
  from public.ai_usage_events
  where user_id = v_user_id
    and created_at >= pg_catalog.date_trunc('month', pg_catalog.now());

  if v_month_used + v_units > v_month_limit then
    v_retry_after := greatest(
      1,
      ceil(extract(epoch from (
        pg_catalog.date_trunc('month', pg_catalog.now()) + interval '1 month' - pg_catalog.now()
      )))::integer
    );

    return pg_catalog.jsonb_build_object(
      'allowed', false,
      'reason', 'monthly_quota',
      'retryAfterSeconds', v_retry_after,
      'remainingMonthlyUnits', greatest(v_month_limit - v_month_used, 0)
    );
  end if;

  insert into public.ai_usage_events (user_id, operation, units)
  values (v_user_id, p_operation, v_units);

  return pg_catalog.jsonb_build_object(
    'allowed', true,
    'reason', null,
    'retryAfterSeconds', 0,
    'remainingMonthlyUnits', v_month_limit - v_month_used - v_units
  );
end;
$$;

revoke all on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;

-- Existing structured-output persistence functions should not retain
-- PostgreSQL's default PUBLIC execute grant. Each remains SECURITY INVOKER, so
-- the caller's RLS boundary continues to apply.
do $$
begin
  if pg_catalog.to_regprocedure('public.replace_job_requirements(uuid,jsonb,jsonb)') is not null then
    execute 'revoke all on function public.replace_job_requirements(uuid,jsonb,jsonb) from public, anon';
    execute 'grant execute on function public.replace_job_requirements(uuid,jsonb,jsonb) to authenticated';
  end if;

  if pg_catalog.to_regprocedure('public.save_resume_draft(uuid,text,text,jsonb,jsonb)') is not null then
    execute 'revoke all on function public.save_resume_draft(uuid,text,text,jsonb,jsonb) from public, anon';
    execute 'grant execute on function public.save_resume_draft(uuid,text,text,jsonb,jsonb) to authenticated';
  end if;

  if pg_catalog.to_regprocedure('public.apply_resume_import(uuid,jsonb,jsonb)') is not null then
    execute 'revoke all on function public.apply_resume_import(uuid,jsonb,jsonb) from public, anon';
    execute 'grant execute on function public.apply_resume_import(uuid,jsonb,jsonb) to authenticated';
  end if;

  if pg_catalog.to_regprocedure('public.delete_my_account()') is not null then
    execute 'revoke all on function public.delete_my_account() from public, anon';
    execute 'grant execute on function public.delete_my_account() to authenticated';
  end if;

  -- Trigger and event-trigger functions are invoked internally by PostgreSQL;
  -- browser roles never need direct EXECUTE permission on either helper.
  if pg_catalog.to_regprocedure('public.set_updated_at()') is not null then
    execute 'revoke all on function public.set_updated_at() from public, anon, authenticated';
  end if;

  if pg_catalog.to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

-- Prevent newly created public-schema functions owned by this deployment role
-- from automatically becoming executable by every database role.
alter default privileges in schema public revoke execute on functions from public;

-- Usage history is account data and follows the existing account-wipe contract.
create or replace function public.wipe_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ai_usage_events where user_id = auth.uid();
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
