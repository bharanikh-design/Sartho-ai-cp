"use client";

import Link from "next/link";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page-stack" role="alert">
      <section className="glass-card content-card empty-state-card">
        <div className="page-eyebrow">Temporary loading issue</div>
        <h1>That page did not load cleanly.</h1>
        <p>
          Your saved career data is still safe. This is usually a temporary connection or
          session problem, so try the page once more before signing in again.
        </p>
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
