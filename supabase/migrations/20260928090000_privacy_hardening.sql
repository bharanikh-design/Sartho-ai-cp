begin;

-- Two privacy repairs found in review.
--
-- 1. "Delete all my data" left seven tables behind.
--
-- Every table added after 2026-09-20 carries a user_id and is cleared only by
-- the auth.users cascade — which runs on account deletion, not on the
-- in-product wipe. So somebody who chose "wipe my workspace but keep my
-- account" kept their notification address, their saved search brief, their
-- employer sources, their context snapshots, their interaction history and
-- their in-flight AI operations, all of it under a button that said it had
-- been removed. Rewritten in full, every existing line carried over, with the
-- missing tables added. A table missing from this list is data somebody
-- believes they deleted.
create or replace function public.wipe_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.durable_ai_operations where user_id = auth.uid();
  delete from public.candidate_interactions where user_id = auth.uid();
  delete from public.candidate_context_snapshots where user_id = auth.uid();
  delete from public.employer_career_sources where user_id = auth.uid();
  delete from public.evidence_embeddings where user_id = auth.uid();
  delete from public.notification_preferences where user_id = auth.uid();
  delete from public.search_preferences where user_id = auth.uid();
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

-- 2. The error log accepted rows from anybody.
--
-- The insert policy on system_errors had no role clause and a check of
-- `true`, so anyone holding the publishable key — which is in every browser
-- bundle — could write unbounded rows straight to PostgREST, with any
-- route, message, stack or metadata they liked. The app only ever writes
-- this table from a signed-in server request, so that is who may insert.
revoke insert on table public.system_errors from public, anon;
drop policy if exists "Allow server to insert system errors" on public.system_errors;
create policy "Allow server to insert system errors"
  on public.system_errors
  for insert to authenticated
  with check (true);

commit;
