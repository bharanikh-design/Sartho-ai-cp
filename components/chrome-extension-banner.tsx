"use client";
import { useEffect, useState } from "react";

export function ChromeExtensionBanner() {
  const [hasExtension, setHasExtension] = useState(true); // Assume true to prevent flicker, check after mount

  useEffect(() => {
    // We can detect the extension by listening for a ping or checking a flag
    // The extension's content script sets window.__SARTHO_EXTENSION_ACTIVE__ = true;
    const checkExtension = () => {
      // @ts-ignore
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
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", background: "linear-gradient(90deg, #103d2e 0%, #174b3a 100%)", borderRadius: "12px", border: "1px solid #6bcf93", marginBottom: "32px", boxShadow: "0 8px 30px rgba(23, 75, 58, 0.2)" }}>
      <div>
        <h3 style={{ margin: "0 0 4px 0", color: "white", fontSize: "1rem" }}>Install the Sartho Auto-Applier Extension</h3>
        <p style={{ margin: 0, color: "#b9d1c6", fontSize: "0.875rem" }}>Import jobs directly from LinkedIn in one click and auto-fill applications on Workday & Greenhouse.</p>
      </div>
      <a href="#" onClick={(e) => { e.preventDefault(); alert('Redirecting to Chrome Web Store...'); }} style={{ background: "white", color: "#174b3a", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", fontSize: "0.875rem", textDecoration: "none", flexShrink: 0 }}>Download Extension ↗</a>
    </div>
  );
}
