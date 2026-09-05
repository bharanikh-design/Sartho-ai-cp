-- AI allowance was one shared pool, and Career Direction spent it on autopilot.
--
-- Two faults, one symptom ("This account has reached its monthly AI allowance"):
--
--   1. Career Direction re-ran the model on every page load. Nothing was
--      stored, so simply visiting the page cost 2 units — roughly fifty visits
--      drained the month.
--   2. All four operations drew on a single 100-unit pool, so that browsing
--      could — and did — block résumé import, the one thing a new user must be
--      able to do.
--
-- The cache below is the real saving: suggestions persist, and the model runs
-- only when someone asks for a fresh set. The per-operation budgets are the
-- safety net — each kind of work has its own ceiling, so exhausting one can
-- never disable another.

begin;

-- The current set of AI role suggestions, so a page visit is a read.
create table if not exists public.direction_suggestion_sets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  suggestions jsonb not null default '[]'::jsonb,
  -- The steering text that produced this set, echoed back so the box is not empty.
  steering text not null default '',
  -- Suggestions the person dismissed; they must not reappear on the next visit.
  dismissed text[] not null default '{}',
  evidence_count integer not null default 0,
  role_count integer not null default 0,
  generated_at timestamptz not null default now()
);

comment on table public.direction_suggestion_sets is
  'Cached AI role suggestions per user. Read on page load; written only when the model actually runs.';

alter table public.direction_suggestion_sets enable row level security;

drop policy if exists "own direction suggestions" on public.direction_suggestion_sets;
create policy "own direction suggestions"
  on public.direction_suggestion_sets
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.direction_suggestion_sets to authenticated;

-- Suggestions become their own operation: one unit, not the two that a full
-- deep analysis costs, because it is a single bounded call.
alter table public.ai_usage_events drop constraint if exists ai_usage_events_operation_check;
alter table public.ai_usage_events add constraint ai_usage_events_operation_check
  check (operation in ('resume_import', 'deep_analysis', 'resume_draft', 'direction_suggestions'));

/*
 * Per-operation budgets. Each row is (units per call, burst window, calls per
 * window, units per month). The monthly figures are set so ordinary use never
 * reaches them, while a runaway loop stops inside one kind of work:
 *
 *   resume_import        3 units ×  15 calls  =  45 units
 *   direction_suggestions 1 unit  ×  40 calls  =  40 units
 *   deep_analysis        2 units ×  50 calls  = 100 units
 *   resume_draft         2 units ×  30 calls  =  60 units
 *
 * To change a budget, edit the case block below and re-run this migration.
 */
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
  v_month_limit integer;
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
      v_month_limit := 45;
    when 'direction_suggestions' then
      v_units := 1;
      v_window := interval '10 minutes';
      v_window_limit := 8;
      v_month_limit := 40;
    when 'deep_analysis' then
      v_units := 2;
      v_window := interval '10 minutes';
      v_window_limit := 8;
      v_month_limit := 100;
    when 'resume_draft' then
      v_units := 2;
      v_window := interval '10 minutes';
      v_window_limit := 5;
      v_month_limit := 60;
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

  -- Counted per operation, so one kind of work can never disable another.
  select coalesce(sum(units), 0)::integer
    into v_month_used
  from public.ai_usage_events
  where user_id = v_user_id
    and operation = p_operation
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

-- The cache is account data and follows the existing wipe contract.
create or replace function public.wipe_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.direction_suggestion_sets where user_id = auth.uid();
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
