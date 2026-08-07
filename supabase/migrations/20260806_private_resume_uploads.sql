begin;

-- Résumé bytes bypass the web function's request-body limit by going directly
-- into a private bucket. They are temporary: the import API deletes each object
-- immediately after extracting its text.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resume-uploads',
  'resume-uploads',
  false,
  8388608,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "upload own temporary resumes" on storage.objects;
create policy "upload own temporary resumes" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'resume-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "read own temporary resumes" on storage.objects;
create policy "read own temporary resumes" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'resume-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "delete own temporary resumes" on storage.objects;
create policy "delete own temporary resumes" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'resume-uploads'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

commit;
