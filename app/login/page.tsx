import { FrontDoor } from "@/components/landing/front-door";

/*
 * The sign-in route.
 *
 * The screen itself lives in a component because the public home page shows the
 * same thing. Somebody arriving at sartho.tech should be able to sign in where
 * they land rather than being sent somewhere else to do it, and a second copy of
 * an OAuth flow — with its own origin handoff and its own idea of where to return
 * to — is the kind of duplication that goes wrong quietly. The front door and
 * this route render the identical component and drive it from the same
 * useOAuthSignIn hook.
 */
export default function LoginPage() {
  return <FrontDoor />;
}
