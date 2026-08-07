import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export type AiOperation =
  | "resume_import"
  | "deep_analysis"
  | "resume_draft";

const decisionSchema = z.object({
  allowed: z.boolean(),
  reason: z.enum(["rate_limit", "monthly_quota"]).nullable(),
  retryAfterSeconds: z.number().int().nonnegative(),
  remainingMonthlyUnits: z.number().int().nonnegative().nullable(),
});

export type AiQuotaCheck =
  | {
      allowed: true;
      remainingMonthlyUnits: number;
    }
  | {
      allowed: false;
      status: 429 | 503;
      message: string;
      retryAfterSeconds: number;
      reason: "rate_limit" | "monthly_quota" | "unavailable";
    };

export async function checkAiQuota(
  supabase: SupabaseClient,
  operation: AiOperation,
): Promise<AiQuotaCheck> {
  const { data, error } = await supabase.rpc("consume_ai_quota", { p_operation: operation });

  if (error) {
    return {
      allowed: false,
      status: 503,
      message: "AI work is temporarily unavailable. Please try again shortly.",
      retryAfterSeconds: 60,
      reason: "unavailable",
    };
  }

  const parsed = decisionSchema.safeParse(data);
  if (!parsed.success) {
    return {
      allowed: false,
      status: 503,
      message: "AI work is temporarily unavailable. Please try again shortly.",
      retryAfterSeconds: 60,
      reason: "unavailable",
    };
  }

  if (parsed.data.allowed) {
    return {
      allowed: true,
      remainingMonthlyUnits: parsed.data.remainingMonthlyUnits ?? 0,
    };
  }

  return {
    allowed: false,
    status: 429,
    message: parsed.data.reason === "monthly_quota"
      ? "This account has reached its monthly AI allowance."
      : "Too many AI requests were started at once. Please wait and try again.",
    retryAfterSeconds: Math.max(parsed.data.retryAfterSeconds, 1),
    reason: parsed.data.reason ?? "rate_limit",
  };
}

export function aiQuotaResponse(check: Extract<AiQuotaCheck, { allowed: false }>) {
  return NextResponse.json(
    { error: check.message, code: check.reason },
    {
      status: check.status,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(check.retryAfterSeconds),
      },
    },
  );
}
