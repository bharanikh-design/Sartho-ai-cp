import { redirect } from "next/navigation";

/*
 * Every URL that matches no route leads back to the front door.
 *
 * A mistyped or stale address — /login.do, an old bookmark, a truncated link —
 * has nothing useful to say to a visitor here, and a bare 404 is a dead end on
 * a product that has exactly one way in. Sending them to the root puts them
 * either on their workspace, if they are signed in, or on the entry screen,
 * because the session middleware redirects anyone signed out to /login.
 *
 * Routes that fail to find a specific thing rather than a page — a job that no
 * longer exists, say — should keep their own not-found, so this does not
 * swallow a real answer. See app/jobs/[id]/not-found.tsx.
 */
export default function NotFound() {
  redirect("/");
}
