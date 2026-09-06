/*
 * Can this deployment send a scheduled email at all?
 *
 * Three separate things have to be true, and when any one of them is false the
 * symptom is identical and silent: no email arrives. That is the worst kind of
 * failure to diagnose, because an absent email is exactly what a quiet day
 * looks like, so nobody investigates until somebody thinks to ask.
 *
 * CRON_SECRET is the one worth naming loudest. Vercel sends it as the bearer
 * token on every scheduled invocation, and both cron routes reject the request
 * outright without it. Unset, every run since deployment has returned 401 —
 * nothing sent, nothing logged in the product, no sign anywhere.
 *
 * Nothing here returns a value or any part of one. The variable's name and
 * whether it is set is the whole report — the same rule the AI provider check
 * already follows.
 */

export type DeliveryRequirement = {
  envVar: string;
  /** What breaks when this is missing, in the words of the person affected. */
  purpose: string;
  present: boolean;
};

export type ScheduledJob = {
  name: string;
  path: string;
  /** The cron expression as deployed, in UTC. */
  schedule: string;
  plainEnglish: string;
};

export type DeliveryDiagnostics = {
  requirements: DeliveryRequirement[];
  jobs: ScheduledJob[];
  /** True only when every requirement is met. */
  ready: boolean;
  /** What to do next, or null when there is nothing to fix. */
  remedy: string | null;
};

const isSet = (name: string): boolean => Boolean(process.env[name]?.trim());

/*
 * Mirrors vercel.json. Duplicated rather than read from it, because the file is
 * a build input and reading it at runtime on a serverless function is a
 * different kind of fragile — but a mismatch here would be a lie, so the two
 * are checked against each other by a test.
 */
export const SCHEDULED_JOBS: ScheduledJob[] = [
  {
    name: "Daily summary",
    path: "/api/cron/daily-digest",
    schedule: "0 0 * * *",
    plainEnglish: "Every day at midnight UTC.",
  },
  {
    name: "Match alerts",
    path: "/api/cron/match-alerts",
    schedule: "0 21 * * *",
    plainEnglish: "Every day at 21:00 UTC.",
  },
];

export function deliveryDiagnostics(): DeliveryDiagnostics {
  const requirements: DeliveryRequirement[] = [
    {
      envVar: "CRON_SECRET",
      purpose: "Authorises the scheduled runs. Without it both jobs reject every invocation and nothing is ever sent.",
      present: isSet("CRON_SECRET"),
    },
    {
      envVar: "RESEND_API_KEY",
      purpose: "The email provider. Without it the jobs stop before sending and report that delivery is not configured.",
      present: isSet("RESEND_API_KEY"),
    },
    {
      envVar: "SARTHO_EMAIL_FROM",
      purpose: "The verified sending address. Without it no email can be addressed.",
      present: isSet("SARTHO_EMAIL_FROM"),
    },
    {
      envVar: "SUPABASE_SERVICE_ROLE_KEY",
      purpose: "Lets a scheduled run read across accounts. Without it the jobs cannot find who opted in.",
      /*
       * Exactly the name lib/supabase/admin.ts reads, and no alias. A check
       * that accepts a second spelling reports "present" for a deployment the
       * code will still refuse to start on, which is worse than no check.
       */
      present: isSet("SUPABASE_SERVICE_ROLE_KEY"),
    },
  ];

  const missing = requirements.filter((requirement) => !requirement.present);

  return {
    requirements,
    jobs: SCHEDULED_JOBS,
    ready: missing.length === 0,
    remedy: missing.length
      ? `Set ${missing.map((requirement) => requirement.envVar).join(" and ")} in the deployment settings, then redeploy — environment changes do not reach a running deployment.`
      : null,
  };
}
