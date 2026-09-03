import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Logs an error to the standard console and asynchronously writes it to the
 * system_errors table in Supabase for centralized observability.
 */
export async function logError(
  supabase: SupabaseClient | null,
  context: string,
  error: unknown,
  metadata?: Record<string, unknown>
) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // Always log to console for standard Vercel logs and local development
  console.error(`[${context}]`, message, stack ?? "");
  if (metadata) {
    console.error(`[${context}] Metadata:`, metadata);
  }

  // If a Supabase client is provided, persist it in the database
  if (supabase) {
    supabase
      .from("system_errors")
      .insert({
        route: context,
        message,
        stack,
        metadata: metadata ?? {},
      })
      .then(({ error: dbError }) => {
        if (dbError) {
          console.error(`[${context}] Failed to write to system_errors table:`, dbError);
        }
      });
  }
}
