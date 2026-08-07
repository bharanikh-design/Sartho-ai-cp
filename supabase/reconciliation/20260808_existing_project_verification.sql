-- Read-only verification for the existing live Sartho project.
-- Run before reconciliation to see any failures and again afterwards to prove
-- the final state. This query reads metadata only and never reads user rows.

with required_tables(table_name) as (
  values
    ('profiles'),
    ('target_lanes'),
    ('career_roles'),
    ('evidence_items'),
    ('jobs'),
    ('job_requirements'),
    ('applications'),
    ('resume_imports')
),
required_policies(table_name, policy_name) as (
  values
    ('profiles', 'own profile'),
    ('target_lanes', 'own target lanes'),
    ('career_roles', 'own career roles'),
    ('evidence_items', 'own evidence'),
    ('jobs', 'own jobs'),
    ('job_requirements', 'own job requirements'),
    ('applications', 'own applications'),
    ('resume_imports', 'own resume imports')
),
required_functions(signature) as (
  values
    ('public.replace_job_requirements(uuid,jsonb,jsonb)'),
    ('public.save_resume_draft(uuid,text,text,jsonb,jsonb)'),
    ('public.apply_resume_import(uuid,jsonb,jsonb)'),
    ('public.consume_ai_quota(text)'),
    ('public.wipe_my_data()'),
    ('public.delete_my_account()')
),
table_report as (
  select required.table_name,
         table_definition.oid is not null as object_exists,
         coalesce(table_definition.relrowsecurity, false) as rls_enabled
  from required_tables required
  left join pg_catalog.pg_class table_definition
    on table_definition.relnamespace = 'public'::pg_catalog.regnamespace
   and table_definition.relname = required.table_name
   and table_definition.relkind = 'r'
),
policy_report as (
  select required.table_name,
         required.policy_name,
         policy.policyname is not null as authenticated_only
  from required_policies required
  left join pg_catalog.pg_policies policy
    on policy.schemaname = 'public'
   and policy.tablename = required.table_name
   and policy.policyname = required.policy_name
   and policy.cmd = 'ALL'
   and policy.roles = array['authenticated']::name[]
),
function_report as (
  select required.signature,
         pg_catalog.to_regprocedure(required.signature) is not null as object_exists,
         coalesce(pg_catalog.has_function_privilege(
           'anon', pg_catalog.to_regprocedure(required.signature), 'EXECUTE'
         ), false) as anonymous_can_execute,
         coalesce(pg_catalog.has_function_privilege(
           'authenticated', pg_catalog.to_regprocedure(required.signature), 'EXECUTE'
         ), false) as authenticated_can_execute
  from required_functions required
),
anonymous_function_exposure as (
  select p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')' as signature
  from pg_catalog.pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
),
checks(check_name, passed, detail) as (
  select 'required tables exist',
         bool_and(object_exists),
         coalesce(jsonb_agg(table_name order by table_name) filter (where not object_exists), '[]'::jsonb)
  from table_report
  union all
  select 'RLS enabled on every user table',
         bool_and(rls_enabled),
         coalesce(jsonb_agg(table_name order by table_name) filter (where not rls_enabled), '[]'::jsonb)
  from table_report
  union all
  select 'owner policies are authenticated-only',
         bool_and(authenticated_only),
         coalesce(jsonb_agg(policy_name order by policy_name) filter (where not authenticated_only), '[]'::jsonb)
  from policy_report
  union all
  select 'required functions exist',
         bool_and(object_exists),
         coalesce(jsonb_agg(signature order by signature) filter (where not object_exists), '[]'::jsonb)
  from function_report
  union all
  select 'anonymous role cannot execute application functions',
         count(*) = 0,
         coalesce(jsonb_agg(signature order by signature), '[]'::jsonb)
  from anonymous_function_exposure
  union all
  select 'authenticated role can execute application functions',
         bool_and(authenticated_can_execute),
         coalesce(jsonb_agg(signature order by signature) filter (where not authenticated_can_execute), '[]'::jsonb)
  from function_report
  union all
  select 'temporary resume bucket is private and bounded',
         count(*) = 1,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', id,
           'public', public,
           'file_size_limit', file_size_limit,
           'allowed_mime_types', allowed_mime_types
         )), '[]'::jsonb)
  from storage.buckets
  where id = 'resume-uploads'
    and public is false
    and file_size_limit = 8388608
    and allowed_mime_types @> array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ]::text[]
  union all
  select 'quota ledger is RLS-protected and not directly exposed',
         quota.oid is not null
           and quota.relrowsecurity
           and not pg_catalog.has_table_privilege('anon', quota.oid, 'SELECT')
           and not pg_catalog.has_table_privilege('authenticated', quota.oid, 'SELECT'),
         jsonb_build_object(
           'exists', quota.oid is not null,
           'rls_enabled', coalesce(quota.relrowsecurity, false)
         )
  from (select pg_catalog.to_regclass('public.ai_usage_events') as oid) found
  left join pg_catalog.pg_class quota on quota.oid = found.oid
  union all
  select 'legacy project remains outside automatic migration history',
         pg_catalog.to_regclass('supabase_migrations.schema_migrations') is null,
         jsonb_build_object(
           'migration_history_table_exists',
           pg_catalog.to_regclass('supabase_migrations.schema_migrations') is not null
         )
)
select check_name,
       case when passed then 'PASS' else 'FAIL' end as status,
       detail
from checks
order by check_name;
