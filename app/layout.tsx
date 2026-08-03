import type { Metadata } from "next";
import type { ReactNode } from "react";
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
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: {
    default: "Sartho",
    template: "%s · Sartho",
  },
  description: "Sartho is an evidence-led AI career copilot for role matching, résumé tailoring, interview preparation and application tracking.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/*
          Applied before the app paints so a light-mode user never sees a dark
          flash. Reads the saved choice, falling back to the OS preference.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("sartho-theme");if(!t){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","dark");}})();`,
          }}
        />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
