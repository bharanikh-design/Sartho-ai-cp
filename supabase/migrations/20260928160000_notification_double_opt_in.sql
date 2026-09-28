begin;

-- An address has to say yes before anything is sent to it.
--
-- The notification address was typed in and used as typed, so anybody with an
-- account could point the daily summary of their own pipeline at a stranger's
-- inbox, every day, and the stranger could do nothing about it but click the
-- unsubscribe link. From here an address is either the account's own sign-in
-- address, which the identity provider already verified, or one that has been
-- confirmed from a link sent to it. Nothing is sent to an unconfirmed address.
--
-- The stored `email` is the address scheduled email goes to; `email_verified_at`
-- says whether it may. `pending_email` holds a replacement that is waiting for
-- its link to be used while the confirmed one stays in force.

alter table public.notification_preferences
  add column if not exists email_verified_at timestamptz,
  add column if not exists pending_email text
    check (pending_email is null or char_length(pending_email) between 3 and 320),
  -- SHA-256 of the token in the confirmation link. The token itself is never stored.
  add column if not exists verification_token_hash text,
  add column if not exists verification_sent_at timestamptz,
  add column if not exists verification_expires_at timestamptz;

create unique index if not exists notification_preferences_verification_token_uidx
  on public.notification_preferences (verification_token_hash)
  where verification_token_hash is not null;

comment on column public.notification_preferences.email_verified_at is
  'When the stored address was confirmed. Null means nothing is sent to it.';
comment on column public.notification_preferences.pending_email is
  'A replacement address awaiting confirmation; the confirmed one stays in force until then.';

-- An address that is the account's own sign-in address was verified by the
-- identity provider when the person signed in, so it needs no second round.
-- Every other address already stored stays unverified until its owner
-- confirms it from the settings page; the scheduled runs skip it meanwhile.
update public.notification_preferences as p
   set email_verified_at = now()
  from auth.users as u
 where u.id = p.user_id
   and lower(u.email) = lower(p.email)
   and p.email_verified_at is null;

-- Every write to this table now goes through the server with the service
-- role, after the checks above: the address, its verification and the two
-- switches alike. A signed-in browser can read its own row and nothing more,
-- so a direct PostgREST call cannot set an address, mark one verified, forge
-- a token or create a row. Reads stay as they were, and wipe_my_data() is
-- security definer, so it keeps its delete.
revoke insert, update, delete on table public.notification_preferences from authenticated;

commit;
