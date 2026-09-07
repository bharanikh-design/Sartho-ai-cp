-- Contact details on the profile, so a résumé can carry them.
--
-- Sartho's résumé document had no contact block at all: no phone, no LinkedIn,
-- no portfolio, and the name jammed into the same string as the target role.
-- That is most of the reason its templates could not look like the ones people
-- compare them to — the header of every professional résumé is a name, a role
-- and a contact line, and none of those existed as fields.
--
-- profiles already holds full_name and location. These are the three that were
-- missing. The résumé import fills them in from the uploaded document and never
-- overwrites a value somebody has corrected themselves.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists linkedin_url text,
  add column if not exists website_url text;

comment on column public.profiles.phone is
  'Phone number as the person wrote it, including any country code. Never reformatted or inferred.';
comment on column public.profiles.linkedin_url is
  'LinkedIn profile as written on their résumé. Never completed into a full URL on their behalf.';
comment on column public.profiles.website_url is
  'A personal site, portfolio or GitHub. Never an employer''s website.';

-- No RLS change is needed: these are columns on profiles, which is already
-- restricted to the owning user by the policies created with the table. Adding
-- a column does not widen an existing policy.
