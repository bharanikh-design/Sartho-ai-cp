"use client";

import Link from "next/link";
import { OPEN_PRIVACY_PREFERENCES_EVENT } from "@/components/privacy-preferences";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-brand">
        <strong>Sartho</strong>
        <span>AI Career Copilot by WonderfulMinds</span>
      </div>
      <nav className="site-footer-links" aria-label="Legal and support">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_PRIVACY_PREFERENCES_EVENT))}
        >
          Cookie Preferences
        </button>
        <Link href="/contact">Contact Us</Link>
      </nav>
      <small>© 2026 WonderfulMinds. All rights reserved.</small>
    </footer>
  );
}
