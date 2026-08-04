begin;

-- The résumé repository.
--
-- resume_imports recorded that an upload happened and then discarded the thing
-- itself. That left a log, not a repository: the extracted text was thrown away
-- the moment the model had read it, so a résumé could never be re-read with a
-- better prompt, compared against another version, or pointed at as the source
-- of a claim — the only recovery was asking the person to find the file again.

alter table public.resume_imports
  add column if not exists extracted_text text,
  add column if not exists character_count integer,
  add column if not exists label text;

-- Superseded rather than deleted: an import that produced evidence someone has
-- since approved is part of that evidence's provenance, and removing it would
-- orphan the record of where a claim came from.
alter table public.resume_imports
  add column if not exists archived_at timestamptz;

create index if not exists resume_imports_user_active_idx
  on public.resume_imports(user_id, created_at desc)
  where archived_at is null;

commit;
