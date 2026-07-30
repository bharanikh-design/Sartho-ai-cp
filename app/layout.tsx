import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Sidebar } from "@/components/sidebar";

export const metadata: Metadata = {
  title: "Sartho",
  description: "Your career, intelligently guided.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto grid min-h-screen max-w-7xl gap-6 p-4 md:p-6 lg:grid-cols-[250px_1fr]">
          <Sidebar />
          <main className="min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
