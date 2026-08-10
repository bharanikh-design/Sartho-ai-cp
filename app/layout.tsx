import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import "./auth.css";
import "./auth-refinement.css";
import "./product.css";
import "./onboarding.css";
import "./onboarding-responsive.css";
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
import { AppShell } from "@/components/app-shell";

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

export const metadata: Metadata = {
  title: {
    default: "Sartho",
    template: "%s · Sartho",
  },
  description: "Sartho is an evidence-led AI career copilot for role matching, résumé tailoring, interview preparation and application tracking.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        {/*
          Applied before the app paints so a light-mode user never sees a dark
          flash. Reads the saved choice, falling back to the OS preference.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("sartho-theme-v2")||"light";document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`,
          }}
        />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
