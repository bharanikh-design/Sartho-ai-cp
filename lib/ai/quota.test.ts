import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { aiQuotaResponse, checkAiQuota } from "./quota";

function client(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn().mockResolvedValue(result) } as never;
}

describe("checkAiQuota", () => {
  it("allows a request and reports the remaining monthly units", async () => {
    const result = await checkAiQuota(client({
      data: {
        allowed: true,
        reason: null,
        retryAfterSeconds: 0,
        remainingMonthlyUnits: 97,
      },
      error: null,
    }), "resume_import");

    expect(result).toEqual({ allowed: true, remainingMonthlyUnits: 97 });
  });

  it("turns a short-window refusal into a retryable 429", async () => {
    const result = await checkAiQuota(client({
      data: {
        allowed: false,
        reason: "rate_limit",
        retryAfterSeconds: 42,
        remainingMonthlyUnits: null,
      },
      error: null,
    }), "deep_analysis");

    expect(result).toMatchObject({
      allowed: false,
      status: 429,
      reason: "rate_limit",
      retryAfterSeconds: 42,
    });
  });

  it("distinguishes the monthly spending cap from a burst limit", async () => {
    const result = await checkAiQuota(client({
      data: {
        allowed: false,
        reason: "monthly_quota",
        retryAfterSeconds: 86400,
        remainingMonthlyUnits: 1,
      },
      error: null,
    }), "resume_draft");

    expect(result).toMatchObject({ allowed: false, status: 429, reason: "monthly_quota" });
    if (result.allowed) throw new Error("expected a refusal");
    expect(result.message).toContain("monthly AI allowance");
  });

  it("fails closed when the quota service errors or returns malformed data", async () => {
    const errored = await checkAiQuota(client({ data: null, error: { message: "missing migration" } }), "resume_import");
    const malformed = await checkAiQuota(client({ data: { allowed: true }, error: null }), "resume_import");

    expect(errored).toMatchObject({ allowed: false, status: 503, reason: "unavailable" });
    expect(malformed).toMatchObject({ allowed: false, status: 503, reason: "unavailable" });
  });

  it("sets machine-readable error and retry headers", async () => {
    const response = aiQuotaResponse({
      allowed: false,
      status: 429,
      message: "Wait before trying again.",
      retryAfterSeconds: 30,
      reason: "rate_limit",
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ code: "rate_limit" });
  });
});

describe("AI quota migration", () => {
  it("keeps limits server-side and serialises concurrent requests per user", async () => {
    const sql = await readFile("supabase/migrations/20260807_ai_usage_quotas.sql", "utf8");

    expect(sql).toContain("security definer");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("v_month_limit constant integer := 100");
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("revoke all on table public.ai_usage_events from public, anon, authenticated");
    expect(sql).not.toContain("'provider_diagnostics'");
    expect(sql).not.toMatch(/p_(window|limit|units)/);
  });

  it("covers every user-triggered model surface without billing admin diagnostics", async () => {
    const files = await Promise.all([
      readFile("app/api/career/import/route.ts", "utf8"),
      readFile("app/api/jobs/[id]/deep-analysis/route.ts", "utf8"),
      readFile("app/api/jobs/[id]/resume/route.ts", "utf8"),
      readFile("app/api/diagnostics/providers/route.ts", "utf8"),
      readFile("app/diagnostics/page.tsx", "utf8"),
    ]);

    expect(files[0]).toContain('checkAiQuota(supabase, "resume_import")');
    expect(files[1]).toContain('checkAiQuota(supabase, "deep_analysis")');
    expect(files[2]).toContain('checkAiQuota(supabase, "resume_draft")');
    expect(files[3]).not.toContain("checkAiQuota");
    expect(files[4]).not.toContain("checkAiQuota");

    expect(files[0].indexOf("checkAiQuota")).toBeLessThan(files[0].indexOf("generateStructuredJson({"));
    expect(files[1].indexOf("checkAiQuota")).toBeLessThan(files[1].indexOf("generateStructuredJson({"));
    expect(files[2].indexOf("checkAiQuota")).toBeLessThan(files[2].indexOf("generateStructuredJson({"));
    expect(files[3]).toContain("isOperationsAdmin");
    expect(files[4]).toContain("isOperationsAdmin");
    expect(files[3]).toContain("getCachedProviderHealth");
    expect(files[4]).toContain("getCachedProviderHealth");
  });
});
