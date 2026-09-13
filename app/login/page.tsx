import { SignInExperience } from "@/components/auth/sign-in-experience";

/*
 * The sign-in route.
 *
 * The screen itself lives in a component because the public home page shows
 * the same thing. Somebody arriving at sartho.tech should be able to sign in
 * where they land rather than being sent somewhere else to do it, and a second
 * copy of an OAuth flow — with its own origin handoff and its own idea of
 * where to return to — is the kind of duplication that goes wrong quietly.
 */
export default function LoginPage() {
  return <SignInExperience />;
}
