/*
 * How long somebody actually spent in Sartho.
 *
 * Every naive version of this number is wrong in the flattering direction, and
 * a founder is going to quote it, so the arithmetic is worth being strict
 * about.
 *
 * The browser sends a heartbeat on a fixed interval, and only while the tab is
 * visible. Time is credited from the GAP BETWEEN HEARTBEATS rather than from a
 * session start and end, because a session has no observable end: people close
 * laptops, lose connections and leave tabs open for days, and none of those
 * produce a message saying so. A gap is evidence that both ends existed.
 *
 * The cap is what makes it honest. A tab open overnight sends no heartbeats
 * while it is hidden, so the morning's first beat arrives with a nine-hour gap.
 * Crediting that gap would say somebody used Sartho all night. Crediting a
 * capped share of it would still be inventing time nobody spent. So a gap
 * longer than roughly one interval earns NOTHING — the person is here now, and
 * the next beat will credit the interval it actually observes.
 *
 * That deliberately under-counts: every return costs one interval of unrecorded
 * time. Under-counting is the right direction for a metric used to decide
 * whether people find the product useful.
 */

/** How often the browser reports in. Must match the client heartbeat. */
export const HEARTBEAT_SECONDS = 60;

/*
 * The longest gap that can still be believed as continuous presence. A little
 * over one interval, so an ordinary late beat — a slow request, a busy tab — is
 * credited in full rather than thrown away.
 */
export const MAX_CREDITED_GAP_SECONDS = 90;

/*
 * A gap longer than this is somebody coming back, not somebody continuing.
 * Thirty minutes is the convention every analytics tool settled on, and the
 * exact figure matters far less than having one.
 */
export const NEW_VISIT_GAP_SECONDS = 30 * 60;

export type ActivitySnapshot = {
  firstSeenAt: string;
  lastSeenAt: string;
  activeSeconds: number;
  visitCount: number;
};

/**
 * The row as it should look after a heartbeat arrives.
 *
 * Pure, so the one piece of arithmetic that decides an engagement number can be
 * checked against the cases that actually occur — a laptop closed overnight, a
 * duplicated request, a clock that disagrees with the server's.
 */
export function accrueActivity(previous: ActivitySnapshot | null, now: Date): ActivitySnapshot {
  const nowIso = now.toISOString();

  /* Never seen before: they are here, but no time has been observed yet. */
  if (!previous) {
    return { firstSeenAt: nowIso, lastSeenAt: nowIso, activeSeconds: 0, visitCount: 1 };
  }

  const last = new Date(previous.lastSeenAt);
  const previousSeconds = Number.isFinite(previous.activeSeconds) ? Math.max(0, Math.floor(previous.activeSeconds)) : 0;
  const previousVisits = Number.isFinite(previous.visitCount) ? Math.max(0, Math.floor(previous.visitCount)) : 0;

  /*
   * An unreadable or future timestamp. Two requests can arrive out of order,
   * and a stored value can be anything. Credit nothing and do not move
   * last_seen_at backwards — a clock disagreement must not be able to reduce a
   * number, only fail to increase it.
   */
  if (!Number.isFinite(last.getTime())) {
    return { firstSeenAt: previous.firstSeenAt || nowIso, lastSeenAt: nowIso, activeSeconds: previousSeconds, visitCount: Math.max(previousVisits, 1) };
  }

  const gapSeconds = (now.getTime() - last.getTime()) / 1000;

  if (gapSeconds < 0) {
    return {
      firstSeenAt: previous.firstSeenAt,
      lastSeenAt: previous.lastSeenAt,
      activeSeconds: previousSeconds,
      visitCount: Math.max(previousVisits, 1),
    };
  }

  const returning = gapSeconds > NEW_VISIT_GAP_SECONDS;

  /*
   * The whole point. Anything beyond one interval is time we did not observe,
   * so it earns nothing rather than a plausible-looking fraction.
   */
  const credited = gapSeconds <= MAX_CREDITED_GAP_SECONDS ? Math.round(gapSeconds) : 0;

  return {
    firstSeenAt: previous.firstSeenAt || nowIso,
    lastSeenAt: nowIso,
    activeSeconds: previousSeconds + credited,
    visitCount: Math.max(previousVisits, 1) + (returning ? 1 : 0),
  };
}

/*
 * Said the way a person says it. "4920 seconds" is a measurement; "1h 22m" is
 * an answer, and this number exists to be glanced at in a table.
 */
export function describeDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const whole = Math.floor(seconds);
  if (whole < 60) return "<1m";
  const minutes = Math.floor(whole / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
