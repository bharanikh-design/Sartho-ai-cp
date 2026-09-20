begin;

-- Keep the résumé somebody uploaded, exactly as they uploaded it.
--
-- Until now the file went into the private bucket, its text was read out,
-- and the object was deleted before the import row was even written. What
-- survived was a normalised copy of the text — whitespace collapsed, blank
-- lines squeezed, hyphenated line breaks rejoined — which is the right shape
-- for a model prompt and the wrong thing to call somebody's résumé. Nothing
-- on Résumé Studio showed the upload at all, so the honest reading of the
-- page after an upload was that the document had vanished.
--
-- From here the object stays in the bucket, the row remembers where, and
-- extracted_text holds the text exactly as the file reader produced it, with
-- no normalisation. The normalised form is built in memory for the model and
-- never stored.

alter table public.resume_imports
  add column if not exists object_path text,
  add column if not exists is_master boolean not null default false;

comment on column public.resume_imports.object_path is
  'Where the original upload is kept in the resume-uploads bucket. Null on rows from before originals were kept.';
comment on column public.resume_imports.extracted_text is
  'The text of the upload exactly as read from the file: no whitespace normalisation, no truncation.';
comment on column public.resume_imports.is_master is
  'Whether this upload is the person''s master résumé. At most one per person.';

-- One master per person, enforced by the database rather than by a route.
create unique index if not exists resume_imports_user_master_uidx
  on public.resume_imports(user_id)
  where is_master;

-- Marking a master is two writes — clear the old one, set the new one — and
-- they belong in one transaction so a failure between them cannot leave a
-- person with no master at all.
create or replace function public.set_master_resume_import(p_import_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.resume_imports
    where id = p_import_id and user_id = auth.uid() and archived_at is null
  ) then
    raise exception 'Résumé not found or access denied';
  end if;

  update public.resume_imports
     set is_master = false
   where user_id = auth.uid() and is_master;

  update public.resume_imports
     set is_master = true
   where id = p_import_id and user_id = auth.uid();
end;
$$;

revoke all on function public.set_master_resume_import(uuid) from public, anon;
grant execute on function public.set_master_resume_import(uuid) to authenticated;

-- The originals now outlive the import, so wiping an account has to remove
-- them too. Rewritten in full, every existing line carried over: this is the
-- in-product "delete all my data" path, and a table missing from it is data
-- somebody believes they deleted.
create or replace function public.wipe_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.integration_connections where user_id = auth.uid();
  delete from public.user_activity where user_id = auth.uid();
  delete from public.search_results where user_id = auth.uid();
  delete from public.direction_suggestion_sets where user_id = auth.uid();
  delete from public.seen_job_matches where user_id = auth.uid();
  delete from public.ai_usage_events where user_id = auth.uid();
  delete from public.resume_versions where user_id = auth.uid();
  delete from public.applications where user_id = auth.uid();
  delete from public.jobs where user_id = auth.uid();
  delete from public.evidence_items where user_id = auth.uid();
  delete from public.career_roles where user_id = auth.uid();
  delete from public.target_lanes where user_id = auth.uid();
  delete from public.resume_imports where user_id = auth.uid();
  delete from storage.objects
   where bucket_id = 'resume-uploads'
     and (storage.foldername(name))[1] = auth.uid()::text;
  delete from public.profiles where id = auth.uid();
end;
$$;

revoke all on function public.wipe_my_data() from public, anon;
grant execute on function public.wipe_my_data() to authenticated;

commit;
