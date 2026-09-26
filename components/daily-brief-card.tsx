import Link from "next/link";
import type { DailyBrief } from "@/lib/dashboard/daily-brief";

/*
 * The first thing on the page, and the only part of it written in a voice.
 *
 * Everything else on this dashboard is a tile or a queue: correct, and silent.
 * This is Sartho saying what changed and what is worth doing — the thing a
 * recruiter does in the first ten seconds of a call, and the thing the product
 * was computing internally and never saying.
 *
 * It stays short on purpose. Four lines at most, one steer, then it stops.
 */
export function DailyBriefCard({ brief }: { brief: DailyBrief }) {
  return (
    <section className="daily-brief" aria-labelledby="daily-brief-title">
      <p className="daily-brief-eyebrow">
        <span className="ai-orbit" aria-hidden="true">✦</span> Your Sartho briefing
      </p>
      <h2 id="daily-brief-title">{brief.greeting}</h2>

      {brief.lines.length ? (
        <>
          <p className="daily-brief-lead">
            {brief.since ? `Here is what moved ${brief.since}.` : "Here is where things stand."}
          </p>
          <ul className="daily-brief-list">
            {brief.lines.map((line) => (
              <li key={line.id} className={`is-${line.tone}`}>
                <Link href={line.href}>
                  <span>{line.text}</span>
                  <em aria-hidden="true">→</em>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="daily-brief-closing">{brief.closing}</p>
    </section>
  );
}
