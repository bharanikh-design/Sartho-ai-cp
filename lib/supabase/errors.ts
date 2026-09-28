/*
 * Reading PostgREST's answer when the schema is behind the code.
 *
 * Migrations are run by hand, so there is always a window where a deployed
 * route names a column the database does not have yet. PostgREST answers
 * PGRST204 for a column it cannot find in its schema cache; Postgres itself
 * answers 42703. Four routes each carried their own reading of this, and two
 * of them disagreed about 42703 — so the same missing column was a graceful
 * fallback on one path and a bare 500 on another.
 */
export type PostgrestErrorLike = { code?: string; message?: string } | null | undefined;

export function isMissingColumnError(error: PostgrestErrorLike): boolean {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  const message = (error.message ?? "").toLowerCase();
  return message.includes("column") && (message.includes("does not exist") || message.includes("could not find"));
}

/* A table or view that is not there yet: Postgres 42P01, PostgREST PGRST205. */
export function isMissingTableError(error: PostgrestErrorLike, tableName?: string): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const message = (error.message ?? "").toLowerCase();
  if (tableName && message.includes(tableName.toLowerCase())) {
    return message.includes("does not exist") || message.includes("could not find") || message.includes("schema cache");
  }
  return false;
}
