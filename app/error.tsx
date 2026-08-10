"use client";

import Link from "next/link";
import { ProductPageHeader } from "@/components/product-page-header";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page-stack" role="alert">
      <ProductPageHeader
        eyebrow="Temporary loading issue"
        title="That page did not load cleanly."
        description="Your saved career data is still safe. This is usually a temporary connection or session problem, so try the page once more before signing in again."
      />
      <section className="glass-card content-card empty-state-card">
        <div className="hero-actions">
          <button type="button" className="primary-button" onClick={reset}>
            Try again
          </button>
          <Link className="secondary-button" href="/">
            Return home
          </Link>
        </div>
      </section>
    </main>
  );
}
