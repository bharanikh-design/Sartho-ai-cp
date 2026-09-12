begin;

/*
 * The master résumé: one per person, tied to no advert.
 *
 * Every résumé Sartho could produce until now hung off an application, because
 * save_resume_draft takes a job id — which is right for a tailored draft and
 * impossible for a general one. "Build Master Résumé" had been wired to a route
 * that was never written, so the button answered 404 and the résumé a person
 * uploaded appeared to have vanished. It had not: the upload is deleted on
 * purpose once its text is read, and what survives is the evidence. This is
 * where that evidence becomes a document again.
 *
 * On profiles rather than in a table of its own because there is exactly one,
 * it belongs to the person rather than to any application, and a row that
 * already exists needs no lifecycle of its own.
 */
alter table public.profiles
  add column if not exists master_resume jsonb,
  add column if not exists master_resume_text text,
  add column if not exists master_resume_updated_at timestamptz;

comment on column public.profiles.master_resume is
  'Structured ResumeContent for the role-agnostic master résumé, built only from approved evidence.';
comment on column public.profiles.master_resume_text is
  'The rendered text of master_resume, kept in step with it by renderResumeText.';

commit;
