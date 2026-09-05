import type { ScoredJobMatch, SearchCriteria } from "@/lib/jobs/run-search";

/*
 * Match alerts — the email a scheduled search sends.
 *
 * Two rules make it worth opening. Only roles that scored apply or review
 * against the person's own evidence go in; a "skip" is noise however new it
 * is. And a listing is emailed once, ever: anything already in the seen table
 * is left out, so a quiet day sends nothing rather than a repeat.
 */

export const MAX_ALERT_MATCHES = 10;

export type AlertMatch = Pick<
  ScoredJobMatch,
  "title" | "employer" | "location" | "url" | "salary" | "source" | "overallMatch" | "recommendation" | "matchedSkills"
>;

/** Strong, unseen matches, best first, capped. Pure. */
export function selectNewMatches(results: ScoredJobMatch[], seenUrls: Iterable<string>): AlertMatch[] {
  const seen = new Set(seenUrls);
  const byKey = new Set<string>();
  return results
    .filter((result) => result.recommendation !== "skip")
    .filter((result) => !seen.has(result.url))
    .filter((result) => {
      // Near-identical reposts (same title + employer) count once.
      const key = `${result.title}|${result.employer ?? ""}`.toLowerCase().trim();
      if (byKey.has(key)) return false;
      byKey.add(key);
      return true;
    })
    .sort((a, b) => b.overallMatch - a.overallMatch)
    .slice(0, MAX_ALERT_MATCHES)
    .map(({ title, employer, location, url, salary, source, overallMatch, recommendation, matchedSkills }) => ({
      title, employer, location, url, salary, source, overallMatch, recommendation, matchedSkills,
    }));
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function describeCriteria(criteria: SearchCriteria): string {
  const parts = [criteria.countryName];
  if (criteria.locations.length) parts.push(criteria.locations.join(", "));
  else parts.push("nationwide");
  if (criteria.remoteOnly) parts.push("remote only");
  if (criteria.roles.length) parts.push(`roles: ${criteria.roles.join(", ")}`);
  if (criteria.companies.length) parts.push(`companies: ${criteria.companies.join(", ")}`);
  return parts.join(" · ");
}

export function renderMatchAlertEmail(input: {
  firstName: string;
  matches: AlertMatch[];
  criteria: SearchCriteria;
  appUrl: string;
  isTest?: boolean;
}) {
  const { firstName, matches, criteria, appUrl } = input;
  const count = matches.length;
  const noun = count === 1 ? "match" : "matches";
  const subject = input.isTest
    ? `Test: ${count} ${noun} for your Sartho search brief`
    : `${count} new ${noun} in ${criteria.countryName} · Sartho`;

  const rows = matches.map((match) => {
    const tone = match.recommendation === "apply" ? "#2f8b69" : "#a9752d";
    const meta = [match.employer, match.location, match.salary].filter(Boolean).map((part) => escapeHtml(part as string)).join(" · ");
    const skills = match.matchedSkills.length
      ? `<div style="margin-top:6px;color:#4f6459;font-size:12px">Matches your evidence on: ${escapeHtml(match.matchedSkills.join(", "))}</div>`
      : "";
    return `<tr><td style="padding:14px 0;border-bottom:1px solid #dce7e1">
      <div style="font-size:12px;color:#65756d">${meta}</div>
      <div style="font-size:16px;font-weight:700;margin:3px 0"><a href="${escapeHtml(match.url)}" style="color:#17211d;text-decoration:none">${escapeHtml(match.title)}</a></div>
      <div style="font-size:12px"><span style="display:inline-block;padding:2px 8px;border-radius:100px;border:1px solid ${tone};color:${tone};font-weight:700;text-transform:uppercase">${escapeHtml(match.recommendation)}</span> <span style="color:#4f6459">${match.overallMatch}% match · ${escapeHtml(match.source)}</span></div>
      ${skills}
      <div style="margin-top:8px"><a href="${escapeHtml(match.url)}" style="font-size:13px;color:#155b45">View listing →</a></div>
    </td></tr>`;
  }).join("");

  const intro = input.isTest
    ? "This is a test of your match alerts. Here is what your saved brief finds right now — the scheduled alert will only send roles you have not been shown before."
    : `Sartho ran your saved search brief and found ${count} new ${noun} scored against your approved evidence. You have not been shown any of these before.`;

  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;color:#17211d">
    <h1 style="font-size:22px">${count} ${input.isTest ? "" : "new "}${noun} for you</h1>
    <p>Hello ${escapeHtml(firstName)},</p>
    <p>${intro}</p>
    <p style="font-size:12px;color:#65756d">Searched: ${escapeHtml(describeCriteria(criteria))}</p>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
    <p style="margin-top:20px"><a href="${escapeHtml(appUrl)}/search-plan#find-roles" style="display:inline-block;padding:12px 18px;background:#155b45;color:white;text-decoration:none;border-radius:10px">Open Search Brief to save any of these</a></p>
    <p style="color:#65756d;font-size:12px">Sartho never applies to a role or sends career information without your approval. Turn match alerts off from your Search Brief.</p>
  </div>`;

  return { subject, html };
}
