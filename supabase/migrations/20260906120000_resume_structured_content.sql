-- Keep the résumé's structure, not just a picture of it.
--
-- The drafting route asks the model for a document — a headline, a summary,
-- and sections of bullets, each bullet carrying the ids of the approved
-- evidence that backs it — and got one. Then it joined the whole thing into a
-- single string with newlines and saved only that.
--
-- Everything wrong with Résumé Studio came from that one step. The draft could
-- only be shown in a monospaced <pre>, because a text blob has no structure to
-- lay out. It could not be edited, because there is no safe way to edit a blob,
-- so the only editing surface was a side rail reaching the handful of bullets
-- the ATS had flagged — not the summary, not a heading, not a typo. Templates
-- were impossible, a template being a mapping from structure to layout. And the
-- per-bullet evidence ids, the one thing that makes this résumé provable rather
-- than merely plausible, were collapsed into a single flat list for the whole
-- document.
--
-- The text column stays exactly as it is. It is what the ATS reader scores and
-- what the copy button copies, and lib/resume/content.ts regenerates it from
-- the structure on every save, so the two cannot drift.
--
-- Nothing is backfilled. The structure of a draft saved before today cannot be
-- recovered from SQL, but it can be recovered in the application: the text was
-- written by an encoder we own, so contentFromText reverses it and every
-- existing draft opens in the new editor. What that cannot recover is which
-- evidence backed which line, and those bullets are shown as unbacked rather
-- than being credited with a backing nobody can produce.

begin;

alter table public.applications
  add column if not exists resume_content jsonb;

comment on column public.applications.resume_content is
  'The current draft as a structured document. resume_draft is this, rendered to text.';

alter table public.resume_versions
  add column if not exists content jsonb;

comment on column public.resume_versions.content is
  'This version as a structured document. Null on versions saved before the structure was kept.';

-- The signature gains a parameter, which Postgres treats as a different
-- function rather than a replacement, so the old one is dropped first.
--
-- p_content carries a default so that a five-argument call still resolves.
-- That is deliberate: it means the migration and the deploy can land in either
-- order without a window where drafting is broken.
drop function if exists public.save_resume_draft(uuid, text, text, jsonb, jsonb);

create or replace function public.save_resume_draft(
  p_job_id uuid,
  p_resume_version text,
  p_resume_draft text,
  p_change_log jsonb,
  p_evidence_ids jsonb,
  p_content jsonb default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_application_id uuid;
  v_version integer;
begin
  if not exists (
    select 1 from public.jobs where id = p_job_id and user_id = auth.uid()
  ) then
    raise exception 'Job not found or access denied';
  end if;

  -- History first: if this insert fails the previous draft is still intact,
  -- which is the whole point of the change.
  select coalesce(max(version_number), 0) + 1
    into v_version
    from public.resume_versions
   where job_id = p_job_id;

  insert into public.resume_versions (
    user_id, job_id, version_number, version_name, draft, change_log, evidence_ids, content
  )
  values (
    auth.uid(),
    p_job_id,
    v_version,
    p_resume_version,
    p_resume_draft,
    coalesce(p_change_log, '[]'::jsonb),
    coalesce(p_evidence_ids, '[]'::jsonb),
    p_content
  );

  insert into public.applications (
    user_id,
    job_id,
    status,
    resume_version,
    resume_draft,
    resume_change_log,
    resume_evidence_ids,
    resume_content,
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
    p_content,
    now()
  )
  on conflict (user_id, job_id)
  do update set
    resume_version = excluded.resume_version,
    resume_draft = excluded.resume_draft,
    resume_change_log = excluded.resume_change_log,
    resume_evidence_ids = excluded.resume_evidence_ids,
    resume_content = excluded.resume_content,
    resume_generated_at = excluded.resume_generated_at
  returning id into v_application_id;

  return v_application_id;
end;
$$;

revoke all on function public.save_resume_draft(uuid, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_resume_draft(uuid, text, text, jsonb, jsonb, jsonb) to authenticated;

commit;
