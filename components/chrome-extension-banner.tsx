"use client";
import { useEffect, useState } from "react";

/*
 * The browser extension is not published to the Chrome Web Store yet, so there
 * is no honest place to send a click. Until there is a real listing URL, this
 * shows a plain "coming soon" pill in the top-right corner rather than a button
 * that fakes a redirect or does nothing when pressed.
 */
const EXTENSION_STORE_URL = "";

export function ChromeExtensionBanner() {
  const [hasExtension, setHasExtension] = useState(true); // Assume true to prevent flicker, check after mount

  useEffect(() => {
    // The extension's content script sets window.__SARTHO_EXTENSION_ACTIVE__ = true.
    const checkExtension = () => {
      // @ts-expect-error (window custom property)
      setHasExtension(Boolean(window.__SARTHO_EXTENSION_ACTIVE__));
    };
    checkExtension();
    const timer = setTimeout(checkExtension, 1000);
    return () => clearTimeout(timer);
  }, []);

  if (hasExtension) return null;

  return (
    <div className="extension-pill" role="note">
      <span className="extension-pill__label">✦ Auto-Applier extension</span>
      {EXTENSION_STORE_URL ? (
        <a className="extension-pill__action" href={EXTENSION_STORE_URL} target="_blank" rel="noreferrer">
          Install ↗
        </a>
      ) : (
        <span className="extension-pill__soon">Coming soon</span>
      )}
    </div>
  );
}
