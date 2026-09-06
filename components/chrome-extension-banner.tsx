"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

/*
 * Whether the browser extension is installed, and what to say if it is not.
 *
 * The check used to read window.__SARTHO_EXTENSION_ACTIVE__, which the content
 * script set on *its* window. A content script shares the page's DOM but not
 * its JavaScript world, so those were two different objects and this was always
 * undefined — the pill said "not installed" to every person who had installed
 * it. Presence is now a data attribute on <html>, which is the one DOM both
 * sides genuinely share.
 *
 * There is still no Chrome Web Store listing, so there is still nothing honest
 * to link to for a one-click install. What there is now is a page that explains
 * how to load it, which is a real destination rather than "coming soon".
 */

/** Set by extension/sartho-connector.js to the installed version. */
const PRESENCE_ATTRIBUTE = "data-sartho-extension";

export function ChromeExtensionBanner() {
  /* Assumed present until proven otherwise, so it does not flash on every load. */
  const [installed, setInstalled] = useState(true);

  useEffect(() => {
    const check = () => setInstalled(document.documentElement.hasAttribute(PRESENCE_ATTRIBUTE));
    check();
    /*
     * The content script runs at document_idle, which can land after React has
     * mounted. One re-check a second later costs nothing and stops a freshly
     * installed extension being reported missing until the next reload.
     */
    const timer = setTimeout(check, 1200);
    return () => clearTimeout(timer);
  }, []);

  if (installed) return null;

  return (
    <div className="extension-pill" role="note">
      <span className="extension-pill__label">✦ Send roles from LinkedIn</span>
      <Link className="extension-pill__action" href="/extension">
        Set up the extension →
      </Link>
    </div>
  );
}
