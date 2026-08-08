const JWT_CLOCK_SKEW_RETRY_MS = 2_000;

type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
};

export function isJwtIssuedAtFutureError(error: SupabaseErrorLike | null | undefined) {
  return error?.code === "PGRST303" && error.message?.toLowerCase().includes("jwt issued at future") === true;
}

/*
 * Supabase Auth and the Data API are separate managed services. Very rarely,
 * a freshly issued session can reach PostgREST a moment before its clock has
 * caught up with the token's `iat` claim. Retrying every database failure would
 * hide real defects; retrying this one documented timing failure once gives the
 * services time to converge without weakening JWT validation.
 */
export async function withJwtClockSkewRetry<T>(
  operation: () => PromiseLike<T>,
  getError: (result: T) => SupabaseErrorLike | null,
  delayMs = JWT_CLOCK_SKEW_RETRY_MS,
) {
  const firstResult = await operation();
  if (!isJwtIssuedAtFutureError(getError(firstResult))) return firstResult;

  await new Promise((resolve) => setTimeout(resolve, delayMs));
  return operation();
}
