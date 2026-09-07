/*
 * Is the daily summary actually being sent?
 *
 * A scheduled email is the one feature that gives no sign when it breaks. If
 * the cron stops reaching Sartho — an unset CRON_SECRET, a suspended project,
 * a schedule that was never deployed — the person sees no error and no email,
 * and an email that does not arrive is indistinguishable from a quiet day. The
 * failure can therefore run for a month before anybody notices.
 *
 * So the question gets answered out loud, from the one piece of evidence that
 * exists: when a digest was last actually sent to this person.
 *
 * The reasoning is deliberately conservative. "Overdue" is a claim about the
 * deployment being broken, and making it wrongly sends somebody to look for a
 * fault that is not there — so a summary is only called overdue once it is a
 * clear day late, not a minute after the schedule.
 */

export type DigestHealth = {
  state: "off" | "waiting" | "healthy" | "overdue";
  /** What to show the person, already written for them. */
  message: string;
  /** Whether to draw attention to it. */
  concerning: boolean;
};

/* Sent daily, so a gap beyond this is a schedule that did not run. */
const OVERDUE_HOURS = 48;

/* Below this, a digest has simply not come round yet — the schedule is daily. */
const SETTLING_HOURS = 26;

export function digestHealth(input: {
  enabled: boolean;
  lastSentAt: string | Date | null;
  /** When the preference was last changed, to tell "just switched on" from "broken". */
  enabledSince?: string | Date | null;
  /**
   * What the email is called, in the sentence. Match alerts run on their own
   * daily schedule and go silent in exactly the same way, so they get the same
   * reasoning — but telling somebody "no summary has been sent" about an alert
   * would send them to the wrong switch.
   */
  noun?: string;
  now?: Date;
}): DigestHealth {
  const now = input.now ?? new Date();
  const noun = input.noun?.trim() || "summary";

  if (!input.enabled) {
    return { state: "off", message: `The daily ${noun} is off, so nothing is being sent.`, concerning: false };
  }

  const lastSent = toDate(input.lastSentAt);

  if (!lastSent) {
    /*
     * Never sent. Whether that is a fault depends on how long it has been
     * switched on — somebody who ticked the box a minute ago is simply waiting
     * for tonight, and telling them their deployment is broken would be wrong.
     */
    const since = toDate(input.enabledSince);
    const waitingHours = since ? hoursBetween(since, now) : null;
    if (waitingHours !== null && waitingHours > OVERDUE_HOURS) {
      return {
        state: "overdue",
        message: `No ${noun} has ever been sent, and this has been switched on for more than two days. The scheduled run is not reaching Sartho.`,
        concerning: true,
      };
    }
    return {
      state: "waiting",
      message: `No ${noun} has been sent yet. The first one goes out on the next scheduled run.`,
      concerning: false,
    };
  }

  const hours = hoursBetween(lastSent, now);
  if (hours > OVERDUE_HOURS) {
    return {
      state: "overdue",
      message: `The last ${noun} was sent ${describeGap(hours)} ago. It should arrive daily, so the scheduled run is not reaching Sartho.`,
      concerning: true,
    };
  }

  if (hours > SETTLING_HOURS) {
    /*
     * Between a day and two days. A schedule can drift by hours, so this is
     * reported without alarm: it is late, not broken, and saying so wrongly is
     * worse than saying nothing.
     */
    return {
      state: "healthy",
      message: `The last ${noun} was sent ${describeGap(hours)} ago — a little later than usual, but the schedule is running.`,
      concerning: false,
    };
  }

  return {
    state: "healthy",
    message: `The last ${noun} was sent ${describeGap(hours)} ago. The schedule is running.`,
    concerning: false,
  };
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function hoursBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (60 * 60 * 1000);
}

/*
 * Rounded the way a person would say it. "1.97 days" is a number pretending to
 * be an observation; nobody reads a timestamp gap to two decimal places.
 */
function describeGap(hours: number): string {
  if (hours < 1) return "less than an hour";
  if (hours < 48) {
    const whole = Math.round(hours);
    return `${whole} hour${whole === 1 ? "" : "s"}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} days`;
}
