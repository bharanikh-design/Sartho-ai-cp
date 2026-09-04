"use client";
import { useEffect, useState } from "react";

export function ChromeExtensionBanner() {
  const [hasExtension, setHasExtension] = useState(true); // Assume true to prevent flicker, check after mount

  useEffect(() => {
    // We can detect the extension by listening for a ping or checking a flag
    // The extension's content script sets window.__SARTHO_EXTENSION_ACTIVE__ = true;
    const checkExtension = () => {
      // @ts-expect-error (window custom property)
      if (window.__SARTHO_EXTENSION_ACTIVE__) {
        setHasExtension(true);
      } else {
        setHasExtension(false);
      }
    };
    
    // Check immediately and then after a small delay in case the content script loads slowly
    checkExtension();
    setTimeout(checkExtension, 1000);
  }, []);

  if (hasExtension) return null;

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px", marginTop: "-16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 16px", background: "rgba(107, 207, 147, 0.1)", borderRadius: "100px", border: "1px solid rgba(107, 207, 147, 0.3)" }}>
        <span style={{ fontSize: "0.8125rem", color: "#6bcf93", fontWeight: 500 }}>✦ Missing Auto-Applier</span>
        <a href="#" onClick={(e) => { e.preventDefault(); alert('Redirecting to Chrome Web Store...'); }} style={{ color: "white", fontSize: "0.8125rem", textDecoration: "none", background: "rgba(255,255,255,0.1)", padding: "4px 12px", borderRadius: "100px" }}>Install Extension ↗</a>
      </div>
    </div>
  );
}
