begin;

-- Anonymous acquisition telemetry.
--
-- One row per browser-generated visitor id. No IP address, no user-agent
-- fingerprint and no page-by-page history: enough to answer how many people
-- reached Sartho before login and whether that browser later converted.
create table if not exists public.anonymous_visitors (
  visitor_id uuid primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visit_count integer not null default 1 check (visit_count >= 1),
  page_view_count integer not null default 1 check (page_view_count >= 1),
  first_path text,
  last_path text,
  referrer_host text,
  converted_user_id uuid references auth.users(id) on delete set null,
  converted_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists anonymous_visitors_last_seen_idx
  on public.anonymous_visitors(last_seen_at desc);
create index if not exists anonymous_visitors_conversion_idx
  on public.anonymous_visitors(converted_user_id);

-- This table is written only by server-side service-role code. Anonymous
-- browsers never receive direct table access.
alter table public.anonymous_visitors enable row level security;
revoke all on table public.anonymous_visitors from anon, authenticated;

comment on table public.anonymous_visitors is
  'Pseudonymous pre-login acquisition telemetry: random browser visitor id, entry/last path, referrer host and eventual account conversion. No IP/device fingerprint.';

-- "Offer" and "Hired" are different outcomes. Add an explicit terminal-success
-- stage rather than inferring a hire from an offer.
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (
  status in ('saved','analysed','approved','applied','acknowledged','assessment','interview','offer','hired','rejected','withdrawn')
);

alter table public.applications drop constraint if exists applications_status_check;
alter table public.applications add constraint applications_status_check check (
  status in ('saved','analysed','approved','applied','acknowledged','assessment','interview','offer','hired','rejected','withdrawn')
);

-- Interaction Memory should learn that a hire is the strongest positive market
-- outcome. The original check was created by the table definition.
alter table public.candidate_interactions
  drop constraint if exists candidate_interactions_event_type_check;
alter table public.candidate_interactions
  add constraint candidate_interactions_event_type_check check (event_type in (
    'search_result_viewed',
    'search_result_saved',
    'job_imported',
    'job_opened',
    'deep_analysis_requested',
    'status_applied',
    'status_assessment',
    'status_interview',
    'status_offer',
    'status_hired',
    'status_withdrawn',
    'status_rejected'
  ));

-- If a user never explicitly selected a master résumé, make the first completed
-- upload the master. For existing accounts with multiple completed uploads but
-- no master, choose the newest completed upload as the sensible default.
with ranked as (
  select
    id,
    user_id,
    row_number() over (
      partition by user_id
      order by completed_at desc nulls last, created_at desc
    ) as rn
  from public.resume_imports
  where status = 'complete'
    and archived_at is null
),
users_without_master as (
  select ranked.id
  from ranked
  where ranked.rn = 1
    and not exists (
      select 1
      from public.resume_imports existing
      where existing.user_id = ranked.user_id
        and existing.is_master = true
        and existing.archived_at is null
    )
)
update public.resume_imports r
set is_master = true
from users_without_master u
where r.id = u.id;

-- Server/route helper: after a completed import, make it master only when the
-- account does not already have one. Explicit user choice always wins.
create or replace function public.ensure_master_resume_import(p_import_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_changed boolean := false;
begin
  if not exists (
    select 1
    from public.resume_imports
    where id = p_import_id
      and user_id = auth.uid()
      and archived_at is null
      and status = 'complete'
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from public.resume_imports
    where user_id = auth.uid()
      and is_master = true
      and archived_at is null
  ) then
    update public.resume_imports
       set is_master = true
     where id = p_import_id
       and user_id = auth.uid();
    v_changed := true;
  end if;

  return v_changed;
end;
$$;

revoke all on function public.ensure_master_resume_import(uuid) from public, anon;
grant execute on function public.ensure_master_resume_import(uuid) to authenticated;

commit;
