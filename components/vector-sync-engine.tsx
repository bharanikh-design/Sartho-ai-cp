"use client";

import { useEffect, useState, useCallback } from "react";

export function VectorSyncEngine() {
  const [status, setStatus] = useState<"idle" | "syncing" | "complete" | "error">("idle");
  const [syncedCount, setSyncedCount] = useState(0);

  const triggerSync = useCallback(async () => {
    setStatus("syncing");
    try {
      const res = await fetch("/api/embeddings/sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      const data = await res.json();
      
      if (data.synced > 0) {
        setSyncedCount(data.synced);
        setStatus("complete");
        // Hide after 5 seconds if successful
        setTimeout(() => setStatus("idle"), 5000);
      } else {
        setStatus("idle"); // Nothing to sync
      }
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  }, []);

  // Listen to journey changes (e.g. when evidence is approved)
  useEffect(() => {
    const onJourneyChange = () => { // eslint-disable-next-line react-hooks/set-state-in-effect
    triggerSync(); };
    window.addEventListener("sartho:journey-changed", onJourneyChange);
    // Initial sync on mount just in case
    // eslint-disable-next-line react-hooks/set-state-in-effect
    triggerSync();
    
    return () => window.removeEventListener("sartho:journey-changed", onJourneyChange);
  }, [triggerSync]);

  if (status === "idle") return null;

  return (
    <div style={{
      background: status === "syncing" ? "rgba(107, 207, 147, 0.1)" : status === "error" ? "rgba(255,100,100,0.1)" : "rgba(107, 207, 147, 0.15)",
      border: status === "syncing" ? "1px solid rgba(107, 207, 147, 0.3)" : "1px solid #6bcf93",
      padding: "16px 24px",
      borderRadius: "12px",
      marginBottom: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      animation: "fadeIn 0.3s ease"
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {status === "syncing" && (
          <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #6bcf93", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
        )}
        {status === "complete" && <span style={{ color: "#6bcf93" }}>✓</span>}
        {status === "error" && <span style={{ color: "#ff6b6b" }}>×</span>}
        
        <div>
          <strong style={{ color: "#fff", display: "block", fontSize: "0.95rem" }}>
            {status === "syncing" ? "AI Neural Synchronization Active" : status === "error" ? "Neural Sync Failed" : "Neural Sync Complete"}
          </strong>
          <span style={{ color: "#aaa", fontSize: "0.85rem" }}>
            {status === "syncing" 
              ? "Vectorizing your master career facts into the Semantic Graph..." 
              : status === "complete" 
                ? `Successfully synchronized ${syncedCount} new career facts.`
                : "Failed to connect to the AI provider."}
          </span>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
    </div>
  );
}
