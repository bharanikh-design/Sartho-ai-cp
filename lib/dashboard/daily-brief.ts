import { NEW_VISIT_GAP_SECONDS } from "@/lib/analytics/activity";
import type { JobRecommendation, JobStatus } from "@/lib/types";

/*
 * The part where Sartho actually says something.
 *
 * Everything below was already being worked out on every dashboard load and
 * then thrown away: buildCareerCommandCentre computes a `metrics` object that
 * app/page.tsx never reads, and an `aiBrief` whose title, employer and summary
 * are computed and dropped. The product was doing the thinking and saying
 * none of it out loud, which is why it can feel like a filing cabinet rather
 * than somebody keeping you posted.
 *
 * A recruiter who knows you does three things when you walk in: greets you,
 * tells you what moved since you were last in, and names the one thing worth
 * doing now. That is all this is.
 *
 * Two rules it must not break.
 *
 * It never invents movement. "New" is only ever said about something that
 * genuinely arrived after the last visit — everything else is described as
 * waiting, which is true and still useful. A brief that cheerfully announces
 * six new roles every morning, the same six, is worse than silence.
 *
 * And it never nags. When nothing needs the person, it says so plainly and
 * stops. The empty state is a good state and should read like one.
 */

export type DailyBriefJob = {
  status: JobStatus;
  recommendation: JobRecommendation | null;
  deep_analysis_status: "not_started" | "processing" | "complete" | "failed";
};

export type DailyBriefInput = {
  now: Date;
  /**
   * The previous visit's last heartbeat.
   *
   * Readable because the heartbeat runs in the browser and this is computed on
   * the server while the page renders: the row still holds the visit before
   * this one. Null for somebody who has never been seen.
   */
  lastSeenAt: string | null;
  firstName: string;
  jobs: DailyBriefJob[];
  /** Career facts a newer résumé added that have not been merged. */
  pendingEvidence: number;
  /** The stored search: how many roles it returned, and when it ran. */
  search: { count: number; searchedAt: string | null } | null;
};

export type BriefTone = "new" | "waiting" | "moving" | "calm";

export type BriefLine = {
  id: string;
  text: string;
  href: string;
  tone: BriefTone;
};

export type DailyBrief = {
  greeting: string;
  /** "since Tuesday", or null when this is the same visit continuing. */
  since: string | null;
  lines: BriefLine[];
  /** The single steer, or the plain truth that nothing is waiting. */
  closing: string;
};

const ACTIVE = new Set<JobStatus>(["applied", "acknowledged", "assessment", "interview"]);
const INTERVIEW = new Set<JobStatus>(["assessment", "interview"]);
const CLOSED = new Set<JobStatus>(["offer", "hired", "rejected", "withdrawn"]);

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The most a brief may say before it stops being a nudge. */
const MAX_LINES = 4;

function plural(count: number, one: string, many = `${one}s`) {
  return `${count} ${count === 1 ? one : many}`;
}

function timeOfDay(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/**
 * How long they have been away, in the words a person would use.
 *
 * Null means they have not been away at all — a refresh, or a second tab. The
 * brief then drops every "new since" claim rather than reporting the same
 * arrivals twice as though they had just landed.
 */
export function awayLabel(now: Date, lastSeenAt: string | null): string | null {
  const last = parseDate(lastSeenAt);
  if (!last) return null;

  const elapsedSeconds = (now.getTime() - last.getTime()) / 1000;
  if (elapsedSeconds < NEW_VISIT_GAP_SECONDS) return null;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
  const daysApart = Math.round((startOfToday - lastDay) / DAY_MS);

  if (daysApart <= 0) return "since earlier today";
  if (daysApart === 1) return "since yesterday";
  if (daysApart < 7) return `since ${WEEKDAYS[last.getDay()]}`;
  return "since your last visit";
}

export function buildDailyBrief(input: DailyBriefInput): DailyBrief {
  const { now, jobs, pendingEvidence, search } = input;
  const name = input.firstName.trim();
  const greeting = name ? `${timeOfDay(now)}, ${name}.` : `${timeOfDay(now)}.`;
  const since = awayLabel(now, input.lastSeenAt);

  const open = jobs.filter((job) => !CLOSED.has(job.status));
  const awaitingAnalysis = open.filter(
    (job) => job.deep_analysis_status !== "complete" && job.recommendation !== "skip",
  ).length;
  const readyToDecide = open.filter(
    (job) => job.deep_analysis_status === "complete" && job.recommendation === "apply" && !ACTIVE.has(job.status),
  ).length;
  const interviews = jobs.filter((job) => INTERVIEW.has(job.status)).length;
  const applicationsOut = jobs.filter(
    (job) => job.status === "applied" || job.status === "acknowledged",
  ).length;

  const lines: BriefLine[] = [];

  /*
   * Roles first, because that is the thing a person came to see. "New" is only
   * said when the search actually ran after they were last here.
   */
  if (search && search.count > 0) {
    const searchedAt = parseDate(search.searchedAt);
    const lastSeen = parseDate(input.lastSeenAt);
    const isNew = Boolean(since && searchedAt && lastSeen && searchedAt.getTime() > lastSeen.getTime());
    lines.push({
      id: "roles",
      text: isNew
        ? `${plural(search.count, "new role")} matched your brief`
        : `${plural(search.count, "role")} from your search still waiting on you`,
      href: "/search-plan",
      tone: isNew ? "new" : "waiting",
    });
  }

  if (awaitingAnalysis) {
    lines.push({
      id: "analysis",
      text: `${plural(awaitingAnalysis, "role")} waiting for analysis`,
      href: "/applications",
      tone: "waiting",
    });
  }

  if (readyToDecide) {
    lines.push({
      id: "decide",
      text: `${plural(readyToDecide, "strong match", "strong matches")} ready for your decision`,
      href: "/applications",
      tone: "waiting",
    });
  }

  if (interviews) {
    lines.push({
      id: "interviews",
      text: `${plural(interviews, "role")} at interview stage`,
      href: "/interview-prep",
      tone: "moving",
    });
  }

  if (applicationsOut) {
    lines.push({
      id: "applications",
      text: `${plural(applicationsOut, "application")} out with employers`,
      href: "/applications",
      tone: "moving",
    });
  }

  if (pendingEvidence) {
    lines.push({
      id: "evidence",
      text: `${plural(pendingEvidence, "career fact")} to reconcile`,
      href: "/career-truth",
      tone: "waiting",
    });
  }

  const kept = lines.slice(0, MAX_LINES);

  /*
   * One steer, chosen in the order a recruiter would raise it: an interview
   * beats a decision, a decision beats unread analysis, and nothing beats
   * saying plainly that nothing is waiting.
   */
  let closing: string;
  if (!kept.length) {
    closing = "Nothing needs you right now — everything you have saved is up to date.";
  } else if (interviews) {
    closing = "The interview is the one worth your time today.";
  } else if (readyToDecide) {
    closing = "Worth deciding on the strong matches before anything else.";
  } else if (awaitingAnalysis) {
    closing = "Start with the analysis — it is what tells you which of these is real.";
  } else if (search && search.count > 0) {
    closing = "Have a look through the roles when you get a moment.";
  } else {
    closing = "Keep the statuses current and Sartho will keep the picture honest.";
  }

  if (!kept.length) {
    return { greeting, since, lines: [], closing };
  }

  return { greeting, since, lines: kept, closing };
}
