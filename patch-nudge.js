/* eslint-disable */
const fs = require('fs');
let content = fs.readFileSync('components/journey-nudge-card.tsx', 'utf8');

// Replace the simple Dismiss button with a powerful CTA routing to /jobs
const oldButton = '<button type="button" onClick={() => setShowCelebration(false)} style={{ background: "#6bcf93", color: "#0d402b", padding: "8px 16px", borderRadius: "8px", fontWeight: "bold", border: "none", cursor: "pointer", fontSize: "0.85rem" }}>\n          Dismiss\n        </button>';

const newButtons = `<div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Link href="/jobs" style={{ background: "#6bcf93", color: "#0d402b", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", textDecoration: "none", fontSize: "0.875rem" }}>
            Explore Opportunities →
          </Link>
          <button type="button" onClick={() => setShowCelebration(false)} style={{ background: "transparent", color: "#b9d1c6", padding: "10px", border: "none", cursor: "pointer", fontSize: "0.875rem" }}>
            Dismiss
          </button>
        </div>`;

if (content.includes(oldButton)) {
  content = content.replace(oldButton, newButtons);
  fs.writeFileSync('components/journey-nudge-card.tsx', content);
  console.log("Patched successfully");
} else {
  console.log("Could not find the old button to replace");
}
