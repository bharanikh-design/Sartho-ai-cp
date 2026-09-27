begin;

/*
 * Job-alert history, stored one way.
 *
 * `seen_job_matches` is how a scheduled search remembers what it has already
 * emailed, so nothing goes out twice. `selectNewMatches` compares a fresh
 * result's URL against these rows.
 *
 * #231 made every card's destination a canonical https URL. Rows written
 * before that hold whatever the mapper returned at the time, including plain
 * `http://`, and since destinations are https-only now the mapper can never
 * emit the http form again — so those rows could never match and every one of
 * those vacancies would be emailed a second time. That was handled in code by
 * folding `http:` into `https:` inside `destinationKey`, which works but
 * suppresses a genuine alert in the (pathological) case of a host serving
 * different content per scheme. This puts the data right so the code does not
 * have to.
 *
 * SCOPE, and why it is this narrow.
 *
 * `destinationKey` parses and re-serialises BOTH sides of the comparison
 * through `URL.href`, so a trailing slash, a mixed-case host and a default
 * port already compare equal without any help from here. The scheme is the
 * one thing `href` preserves and the fold changed, so the scheme is the only
 * thing this migration touches.
 *
 * That is deliberate. Reimplementing WHATWG URL canonicalisation in SQL —
 * percent-encoding, punycode, port defaulting — would put the same rule in two
 * languages, and every bug on #231 came from a rule declared in one place and
 * assumed in another. A SQL version that drifted from the JavaScript one by a
 * single byte would silently re-alert exactly the rows it was meant to fix.
 */

/*
 * Collisions first. The primary key is (user_id, url), so a person holding
 * both `http://x/1` and `https://x/1` would violate it the moment the rewrite
 * lands. Keep the earliest sighting — that is the one whose `first_seen_at`
 * and `emailed_at` describe when this vacancy was really first surfaced —
 * breaking a tie on the url so the choice is deterministic.
 *
 * Scheme matched case-insensitively: these are raw stored strings, so a row
 * may read `HTTP://…`. Left as `http://…`, it would rewrite to nothing here
 * and then fail to match once the fold is gone.
 */
with ranked as (
  select
    user_id,
    url,
    row_number() over (
      partition by
        user_id,
        case
          when lower(url) like 'http://%' then 'https://' || substring(url from 8)
          else url
        end
      order by first_seen_at asc, url asc
    ) as rn
  from public.seen_job_matches
)
delete from public.seen_job_matches target
using ranked
where target.user_id = ranked.user_id
  and target.url = ranked.url
  and ranked.rn > 1;

/*
 * Then the rewrite. 'http://' is seven characters, so the remainder starts at
 * eight and the scheme is simply replaced.
 *
 * The length guard exists because `url` carries `check (char_length(url)
 * between 8 and 2048)` and https is one character longer than http: a URL
 * sitting exactly on the ceiling would fail the constraint and take the whole
 * migration down with it. A row that long is left as it is rather than
 * crashing the run — it would cost one duplicate email, once, for a
 * 2048-character URL that does not exist in practice.
 */
update public.seen_job_matches
set url = 'https://' || substring(url from 8)
where lower(url) like 'http://%'
  and char_length(url) < 2048;

/*
 * Idempotent: a second run finds no `http://` rows, so every partition above
 * is a single row (rn = 1, nothing deleted) and the update matches nothing.
 */

commit;
