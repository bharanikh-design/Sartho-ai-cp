import type { JobRecommendation, JobStatus } from "@/lib/types";

export type DigestJob = {
  title: string;
  employer: string | null;
  status: JobStatus;
  recommendation: JobRecommendation | null;
  created_at: string;
  updated_at: string;
};

export function buildDailyDigest(jobs: DigestJob[], since: Date) {
  const sinceTime = since.getTime();
  const newMatches = jobs.filter((job) => new Date(job.created_at).getTime() >= sinceTime);
  const strongMatches = newMatches.filter((job) => job.recommendation === "apply");
  const applied = jobs.filter((job) => ["applied", "acknowledged", "assessment", "interview"].includes(job.status));
  const reviewed = jobs.filter((job) => ["analysed", "approved", "applied", "acknowledged", "assessment", "interview", "offer", "rejected", "withdrawn"].includes(job.status));
  const outcomes = jobs.filter((job) => ["offer", "rejected", "withdrawn"].includes(job.status) && new Date(job.updated_at).getTime() >= sinceTime);

  return { newMatches, strongMatches, applied, reviewed, outcomes };
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function renderDigestEmail(
  firstName: string,
  digest: ReturnType<typeof buildDailyDigest>,
  applicationUrl: string,
) {
  const outcomeRows = digest.outcomes.length
    ? `<ul>${digest.outcomes.map((job) => `<li>${escapeHtml(job.title)} · ${escapeHtml(job.status)}</li>`).join("")}</ul>`
    : "<p>No new outcomes were recorded.</p>";

  return {
    subject: `Your Sartho daily summary · ${digest.strongMatches.length} strong new matches`,
    html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#17211d"><h1>Your daily career summary</h1><p>Hello ${escapeHtml(firstName)},</p><p>Here is what changed in your private Sartho workspace during the last 24 hours.</p><table style="width:100%;border-collapse:collapse"><tr><td style="padding:12px;border:1px solid #dce7e1"><strong>${digest.newMatches.length}</strong><br>new saved opportunities</td><td style="padding:12px;border:1px solid #dce7e1"><strong>${digest.strongMatches.length}</strong><br>strong new matches</td></tr><tr><td style="padding:12px;border:1px solid #dce7e1"><strong>${digest.applied.length}</strong><br>active applications</td><td style="padding:12px;border:1px solid #dce7e1"><strong>${digest.reviewed.length}</strong><br>reviewed opportunities</td></tr></table><h2>New outcomes</h2>${outcomeRows}<p><a href="${escapeHtml(applicationUrl)}" style="display:inline-block;padding:12px 18px;background:#155b45;color:white;text-decoration:none;border-radius:10px">Open your Dashboard</a></p><p style="color:#65756d;font-size:12px">Sartho never applies to a role or sends career information without your approval. You can turn this digest off from your Dashboard.</p></div>`,
  };
}
