import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SCHEDULED_JOBS, deliveryDiagnostics } from "@/lib/notifications/delivery-diagnostics";

const KEYS = ["CRON_SECRET", "RESEND_API_KEY", "SARTHO_EMAIL_FROM", "SUPABASE_SERVICE_ROLE_KEY"] as const;

describe("deliveryDiagnostics", () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of KEYS) {
      original[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it("reports every requirement missing on a bare deployment", () => {
    const report = deliveryDiagnostics();
    expect(report.ready).toBe(false);
    expect(report.requirements.every((requirement) => !requirement.present)).toBe(true);
    expect(report.remedy).toContain("CRON_SECRET");
    /* Environment changes need a redeploy, and that trips people up every time. */
    expect(report.remedy).toContain("redeploy");
  });

  it("is ready only when all four are set", () => {
    for (const key of KEYS) process.env[key] = "value";
    const report = deliveryDiagnostics();
    expect(report.ready).toBe(true);
    expect(report.remedy).toBeNull();
  });

  /*
   * The silent one. Vercel sends CRON_SECRET as the bearer token on every
   * scheduled invocation, and both cron routes reject the request without it —
   * so a deployment that is otherwise perfectly configured sends nothing, for
   * ever, with no error anywhere a person would look.
   */
  it("catches a deployment that can send email but cannot run the schedule", () => {
    process.env.RESEND_API_KEY = "key";
    process.env.SARTHO_EMAIL_FROM = "alerts@sartho.tech";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service";
    const report = deliveryDiagnostics();
    expect(report.ready).toBe(false);
    expect(report.remedy).toContain("CRON_SECRET");
  });

  it("treats whitespace as unset, because a blank variable is not a value", () => {
    for (const key of KEYS) process.env[key] = "   ";
    expect(deliveryDiagnostics().ready).toBe(false);
  });

  it("never returns a value, only whether one is present", () => {
    for (const key of KEYS) process.env[key] = "super-secret-value";
    const serialised = JSON.stringify(deliveryDiagnostics());
    expect(serialised).not.toContain("super-secret-value");
  });
});

/*
 * The listed schedules are shown to an operator as fact. If they drift from
 * what is actually deployed, the panel is worse than absent — it would send
 * somebody looking at the wrong hour for a job that never ran.
 */
describe("the schedules shown match the ones deployed", () => {
  const vercel = JSON.parse(readFileSync(path.join(process.cwd(), "vercel.json"), "utf8")) as {
    crons?: Array<{ path: string; schedule: string }>;
  };

  it("names every cron in vercel.json, and no others", () => {
    const deployed = (vercel.crons ?? []).map((cron) => `${cron.path} ${cron.schedule}`).sort();
    const listed = SCHEDULED_JOBS.map((job) => `${job.path} ${job.schedule}`).sort();
    expect(listed).toEqual(deployed);
  });
});
