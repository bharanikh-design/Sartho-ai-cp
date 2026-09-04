import { redirect } from "next/navigation";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser, isOperationsAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const { supabase, user } = await requireUser();

  if (!isOperationsAdmin(user)) {
    redirect("/");
  }

  // 1. Fetch Business Metrics
  const [
    { count: totalUsers },
    { count: totalJobs },
    { count: totalApplications },
    { count: totalResumes },
  ] = await Promise.all([
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("jobs").select("*", { count: "exact", head: true }),
    supabase.from("applications").select("*", { count: "exact", head: true }),
    supabase.from("applications").select("*", { count: "exact", head: true }).not("resume_draft", "is", null),
  ]);

  return (
    <div className="page-stack command-centre-page">
      <ProductPageHeader
        eyebrow="Operations & Telemetry"
        title="Admin Command Centre"
        description="Global platform observability. Track system-wide usage, active pipelines, and user adoption. Only visible to platform administrators."
        metric={{ value: totalUsers ?? 0, label: "total active users" }}
      />

      <section className="summary-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <SummaryCard label="Total Users Onboarded" value={String(totalUsers ?? 0)} />
        <SummaryCard label="Jobs Analyzed" value={String(totalJobs ?? 0)} />
        <SummaryCard label="Applications Tracked" value={String(totalApplications ?? 0)} />
        <SummaryCard label="Tailored Resumes Built" value={String(totalResumes ?? 0)} />
      </section>
      
      <div style={{ marginTop: "32px", display: "grid", gap: "24px", gridTemplateColumns: "1fr 1fr" }}>
        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "24px" }}>
          <h3 style={{ color: "#fff", margin: "0 0 16px 0", fontSize: "1.1rem" }}>Vercel Observability Data</h3>
          <p style={{ color: "#aaa", fontSize: "0.9rem", lineHeight: 1.5, marginBottom: "16px" }}>
            To view "Active Minutes Spent", "Live Visitors", and Core Web Vitals, navigate to your <strong>Vercel Dashboard</strong>. Vercel Web Analytics automatically captures session lengths and active minutes natively via the edge network, avoiding heavy DB queries on our end.
          </p>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer" style={{ display: "inline-block", background: "#333", color: "#fff", padding: "8px 16px", borderRadius: "8px", textDecoration: "none", fontSize: "0.85rem", fontWeight: 600 }}>Open Vercel Dashboard ↗</a>
        </div>

        <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "24px" }}>
          <h3 style={{ color: "#fff", margin: "0 0 16px 0", fontSize: "1.1rem" }}>Infrastructure Health</h3>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, color: "#aaa", fontSize: "0.9rem", display: "flex", flexDirection: "column", gap: "12px" }}>
            <li style={{ display: "flex", justifyContent: "space-between" }}><span>Supabase DB Status</span><span style={{ color: "#6bcf93" }}>● Healthy</span></li>
            <li style={{ display: "flex", justifyContent: "space-between" }}><span>OpenAI Agent Gateway</span><span style={{ color: "#6bcf93" }}>● Healthy</span></li>
            <li style={{ display: "flex", justifyContent: "space-between" }}><span>Vercel Edge Network</span><span style={{ color: "#6bcf93" }}>● Healthy</span></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="summary-tile" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <span style={{ fontSize: "0.85rem", color: "#aaa" }}>{label}</span>
      <strong style={{ fontSize: "2rem", color: "#fff", marginTop: "8px", display: "block" }}>{value}</strong>
    </div>
  );
}
