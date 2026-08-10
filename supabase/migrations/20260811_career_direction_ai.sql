begin;

-- Career Direction gains two things: an AI pass that proposes direction from a
-- person's own approved evidence, and a place to keep the link a target profile
-- came from.

-- A target profile can now remember where it came from -- a role title pasted
-- from LinkedIn or any job site keeps its source link for reference. Nullable:
-- a profile the person simply typed has no source.
alter table public.target_lanes
  add column if not exists source_url text;

-- The suggestion pass is a metered AI operation like the others, so the usage
-- ledger has to accept it. The column's original check listed only the first
-- three; it is replaced by a named constraint that includes the new one.
alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_operation_check;
alter table public.ai_usage_events
  add constraint ai_usage_events_operation_check check (
    operation in ('resume_import', 'deep_analysis', 'resume_draft', 'career_suggestions')
  );

-- Recreated only to add the 'career_suggestions' branch; every other line is
-- unchanged from 20260807. A suggestion is one quality call, so it is priced
-- and windowed like deep analysis and résumé drafting.
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
    when 'career_suggestions' then
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

revoke all on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;

commit;
