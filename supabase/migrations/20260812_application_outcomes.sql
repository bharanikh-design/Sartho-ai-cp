begin;

-- Phase 6, "Learn": record why an application ended, not only that it did.
--
-- A status of 'rejected' or 'withdrawn' says an opportunity closed but nothing
-- about what closed it. These columns hold the two mineable facts later
-- analysis groups on -- the stage it ended at and the reason -- plus a free
-- note for the specifics no fixed vocabulary should carry, and the moment the
-- outcome was recorded. All are nullable: an application in motion has no
-- outcome, and existing rows keep their history untouched.
--
-- The allowed values mirror lib/applications/outcome.ts exactly. That module
-- is the single source the write path and UI read from; these constraints are
-- its database-side twin and must be changed together with it.

alter table public.applications
  add column if not exists outcome_stage text,
  add column if not exists outcome_reason text,
  add column if not exists outcome_note text,
  add column if not exists outcome_recorded_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'applications_outcome_stage_check') then
    alter table public.applications add constraint applications_outcome_stage_check check (
      outcome_stage is null or outcome_stage in (
        'pre_submission','screening','assessment','interview','offer'
      )
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'applications_outcome_reason_check') then
    alter table public.applications add constraint applications_outcome_reason_check check (
      outcome_reason is null or outcome_reason in (
        'chose_other_candidate','skills_gap','seniority_mismatch','compensation',
        'location_or_authorisation','role_frozen','no_response','not_a_fit','other'
      )
    );
  end if;
end $$;

-- Lets "how do applications die, and at which stage" answer without a scan
-- once the ledger grows. Partial: rows still in motion carry no reason and
-- have no business in this index.
create index if not exists applications_user_outcome_idx
  on public.applications(user_id, outcome_reason, outcome_stage)
  where outcome_reason is not null;

commit;
