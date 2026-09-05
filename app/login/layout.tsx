import type { ReactNode } from "react";
import { constructMetadata } from "@/lib/seo";

/*
 * The sign-in page is a client component — it holds form state, Supabase auth
 * calls and routing — and Next refuses a `metadata` export from one, because
 * metadata has to resolve on the server before the component renders. It was
 * exported from the page anyway, which broke the production build outright:
 * every deploy from main failed, so the live site sat on its last good build.
 *
 * A route layout is the server boundary that page needs. The metadata lives
 * here; the page stays a client component and renders inside it.
 */
export const metadata = constructMetadata(
  "Sign In",
  "Sign in to your Sartho account to access your AI career copilot.",
  "/login",
);

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
