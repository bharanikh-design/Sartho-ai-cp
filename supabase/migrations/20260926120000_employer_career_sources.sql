begin;

/*
 * The employer careers pages a person verified, kept.
 *
 * "Know an employer's careers page?" on the Search Brief takes a URL, works
 * out which applicant tracking system is behind it, queries that system live
 * to prove it is real, and shows "✓ Connected · 5 jobs sampled". Then it threw
 * the whole configuration away when the response returned.
 *
 * Only the employer's NAME survived, into the chip list. At search time that
 * name was matched against a registry of nine hardcoded companies, so somebody
 * who had just verified their own employer's Workday tenant saw that employer
 * reported as `unknown`, searched zero times. The screen promised "verified
 * employers are added to your targets" and added a string.
 *
 * This is where the proof goes. It is per person because it is their target,
 * not a fact about the world: two people can care about different tenants of
 * the same company, and a URL somebody pasted is not something to publish to
 * everybody else's search.
 */
create table if not exists public.employer_career_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  /* As the person typed it, for showing back to them. */
  employer text not null,
  /*
   * The same normalisation findEmployerPortal applies — lower case, letters
   * and digits only — so a saved source is found by the employer chip whatever
   * punctuation or casing either of them carries.
   */
  employer_key text not null,
  /*
   * The EmployerPortalConfig the discovery step built and the live check
   * proved: type, tenant, site, domain. Stored whole rather than as columns
   * because the shape belongs to lib/jobs/company-careers/types.ts and should
   * be free to grow there without a migration here.
   */
  config jsonb not null,
  careers_url text,
  provider text,
  /* What the verification actually saw, so a stale source can be spotted. */
  verified_at timestamptz not null default now(),
  jobs_found integer not null default 0,
  updated_at timestamptz not null default now(),
  /* One source per employer per person: re-testing replaces, never duplicates. */
  unique (user_id, employer_key)
);

comment on table public.employer_career_sources is
  'Employer careers pages a person verified on the Search Brief, with the ATS configuration the check proved. Consulted before the hardcoded registry in lib/jobs/company-careers/registry.ts.';
comment on column public.employer_career_sources.employer_key is
  'Employer name normalised to lower-case alphanumerics, matching findEmployerPortal.';
comment on column public.employer_career_sources.config is
  'The EmployerPortalConfig proven by the live check: type, tenant, site, domain.';

create index if not exists employer_career_sources_user_idx
  on public.employer_career_sources (user_id);

alter table public.employer_career_sources enable row level security;

drop policy if exists "own employer career sources" on public.employer_career_sources;
create policy "own employer career sources" on public.employer_career_sources for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on table public.employer_career_sources to authenticated;

commit;
