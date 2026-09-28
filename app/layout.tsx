import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import "./auth.css";
import "./auth-refinement.css";
import "./onboarding.css";
import "./shell-refinement.css";
import "./account-and-journey.css";
import "./workspace.css";
import "./ai-workspace.css";
import "./account-actions.css";
import "./loading-and-versions.css";
import "./journey-workspace.css";
import "./sites-integration.css";
import "./experience-polish.css";
import "./ai-career-workspaces.css";
import "./product-system.css";
import "./landing.css";
import "./front-door.css";
import "./trust.css";
/*
 * Last import wins. The monochrome layer redefines the palette tokens as pure
 * black/white and flattens every gradient, for both data-theme="dark" and
 * data-theme="light".
 */
import "./monochrome.css";
import { AppShell } from "@/components/app-shell";
import { AudienceTelemetry } from "@/components/audience-telemetry";
import { PrivacyPreferences } from "@/components/privacy-preferences";
import { SiteFooter } from "@/components/site-footer";
import { siteMetadata } from "@/lib/site-metadata";

/*
 * One typeface, self-hosted. The body font was declared as "Inter" but never
 * actually loaded, so every screen rendered in the system font. Shipping the
 * variable woff2 in-repo makes the intended type real and keeps the build
 * reproducible — no font is fetched at build time.
 */
const inter = localFont({
  src: "./fonts/inter-latin.woff2",
  variable: "--font-inter",
  display: "swap",
  weight: "100 900",
});

export const metadata: Metadata = siteMetadata;

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  /*
   * Every page renders per request, none at build time. The request proxy
   * issues a fresh script nonce for each response and Next writes it onto
   * every script it emits, but only while rendering for a request — a page
   * prerendered at build time carries no nonce, and under the policy its
   * scripts would be refused. The public pages that used to be static are
   * cheap to render, and a page that does not hydrate is not a page.
   */
  await connection();

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <AudienceTelemetry />
        {/*
          Applied before the app paints so a light-mode user never sees a dark
          flash. Reads the saved choice, falling back to the OS preference.
        */}
        
        <AppShell>{children}</AppShell>
        <SiteFooter />
        <PrivacyPreferences />
      </body>
    </html>
  );
}
