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
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
