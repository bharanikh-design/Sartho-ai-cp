begin;

-- Résumé import: the first way career evidence can enter the product.
--
-- Everything downstream — job matching, résumé tailoring, interview prep —
-- reads evidence_items. Until now nothing wrote to it outside a hand-run seed
-- file, so a new account had an empty evidence base and no way to fill it.

create table if not exists public.resume_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  mime_type text,
  byte_size integer,
  status text not null default 'processing',
  error text,
  roles_created integer not null default 0,
  evidence_created integer not null default 0,
  evidence_skipped integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'resume_imports_status_check') then
    alter table public.resume_imports add constraint resume_imports_status_check check (
      status in ('processing','complete','failed')
    );
  end if;
end $$;

-- Re-uploading the same résumé must not duplicate a career. Evidence already
-- dedupes on (user_id, external_key); roles need the same key to match on.
alter table public.career_roles
  add column if not exists external_key text;

create unique index if not exists career_roles_user_external_key_uidx
  on public.career_roles(user_id, external_key)
  where external_key is not null;

create index if not exists resume_imports_user_created_idx
  on public.resume_imports(user_id, created_at desc);

alter table public.resume_imports enable row level security;

drop policy if exists "own resume imports" on public.resume_imports;
create policy "own resume imports" on public.resume_imports
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Applies one extraction in a single transaction.
--
-- Evidence conflicts do nothing rather than overwrite. Once someone has
-- approved or rejected a claim that decision is theirs, and a re-upload must
-- never quietly reset it to pending or rewrite the wording they approved.
-- Roles carry no approval, so their facts are refreshed.
create or replace function public.apply_resume_import(
  p_import_id uuid,
  p_roles jsonb,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_roles_created integer := 0;
  v_evidence_created integer := 0;
  v_evidence_total integer := 0;
begin
  if not exists (
    select 1 from public.resume_imports
    where id = p_import_id and user_id = auth.uid()
  ) then
    raise exception 'Import not found or access denied';
  end if;

  with incoming as (
    select * from jsonb_to_recordset(coalesce(p_roles, '[]'::jsonb)) as item(
      external_key text,
      employer text,
      title text,
      location text,
      start_date date,
      end_date date,
      is_current boolean,
      summary text
    )
  ), upserted as (
    insert into public.career_roles (
      user_id, external_key, employer, title, location, start_date, end_date, is_current, summary
    )
    select
      auth.uid(), incoming.external_key, incoming.employer, incoming.title, incoming.location,
      incoming.start_date, incoming.end_date, coalesce(incoming.is_current, false), incoming.summary
    from incoming
    on conflict (user_id, external_key) where external_key is not null
    do update set
      employer = excluded.employer,
      title = excluded.title,
      location = excluded.location,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      is_current = excluded.is_current,
      summary = excluded.summary
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_roles_created from upserted;

  select count(*) into v_evidence_total
  from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb));

  with incoming as (
    select * from jsonb_to_recordset(coalesce(p_evidence, '[]'::jsonb)) as item(
      external_key text,
      role_external_key text,
      claim text,
      context text,
      period_label text,
      metrics jsonb,
      domains jsonb,
      source_name text,
      source_locator text,
      confidence text
    )
  ), inserted as (
    insert into public.evidence_items (
      user_id, external_key, career_role_id, claim, context, period_label,
      metrics, domains, source_name, source_locator, confidence,
      approval_status, safe_for_resume
    )
    select
      auth.uid(),
      incoming.external_key,
      role.id,
      incoming.claim,
      incoming.context,
      incoming.period_label,
      coalesce(incoming.metrics, '[]'::jsonb),
      coalesce(incoming.domains, '[]'::jsonb),
      incoming.source_name,
      incoming.source_locator,
      coalesce(incoming.confidence, 'medium'),
      'pending',
      false
    from incoming
    left join public.career_roles role
      on role.user_id = auth.uid()
     and role.external_key = incoming.role_external_key
    on conflict (user_id, external_key) where external_key is not null
    do nothing
    returning 1
  )
  select count(*) into v_evidence_created from inserted;

  update public.resume_imports
  set status = 'complete',
      roles_created = v_roles_created,
      evidence_created = v_evidence_created,
      evidence_skipped = greatest(v_evidence_total - v_evidence_created, 0),
      completed_at = now(),
      error = null
  where id = p_import_id and user_id = auth.uid();

  return jsonb_build_object(
    'rolesCreated', v_roles_created,
    'evidenceCreated', v_evidence_created,
    'evidenceSkipped', greatest(v_evidence_total - v_evidence_created, 0)
  );
end;
$$;

grant execute on function public.apply_resume_import(uuid, jsonb, jsonb) to authenticated;

-- Résumé imports belong to the account and must go when it is wiped.
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
  delete from public.resume_imports where user_id = auth.uid();
  delete from public.profiles where id = auth.uid();
end;
$$;

revoke all on function public.wipe_my_data() from public;
grant execute on function public.wipe_my_data() to authenticated;

commit;
