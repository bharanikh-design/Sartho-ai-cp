begin;

-- A durable, append-only ledger for model work. Clients cannot read or write
-- it directly; the security-definer function below is the only entry point.
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

-- Atomically checks and consumes one allowance. The transaction-level advisory
-- lock prevents concurrent requests from all observing the same remaining slot.
-- Limits are deliberately fixed here rather than accepted from the caller.
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

  -- Usage events are operational records, not permanent profile history.
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

revoke all on function public.consume_ai_quota(text) from public;
grant execute on function public.consume_ai_quota(text) to authenticated;

-- Future functions created by this deployment role must be explicitly exposed.
alter default privileges in schema public revoke execute on functions from public;

-- Usage history is account data and follows the existing wipe contract.
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

revoke all on function public.wipe_my_data() from public;
grant execute on function public.wipe_my_data() to authenticated;

commit;
