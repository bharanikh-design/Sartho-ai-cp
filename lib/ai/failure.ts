/*
 * What an AI provider's failure actually means, said in words.
 *
 * Providers answer with their own operational language — "You exceeded your
 * current quota", "insufficient_quota", a link to a billing console. Rendered
 * straight into the product that reads as a bug in Sartho, which is the one
 * thing it is not: the account behind the key has run out of money, or the key
 * is wrong, or the service is rate limiting. Each of those has a different
 * person who can fix it and a different thing for them to do, and none of that
 * survives being printed verbatim.
 */

export type AiFailureKind = "credit" | "rate-limit" | "auth" | "timeout" | "unknown";

export function classifyAiFailure(message: string): AiFailureKind {
  const text = message.toLowerCase();

  if (/insufficient_quota|no credits|exceeded your current quota|billing|payment|check your plan/.test(text)) {
    return "credit";
  }
  if (/rate.?limit|too many requests|429|overloaded|capacity/.test(text)) return "rate-limit";
  if (/invalid.*(api )?key|incorrect api key|unauthorized|401|authentication/.test(text)) return "auth";
  if (/timed? ?out|timeout|aborted|abort/.test(text)) return "timeout";
  return "unknown";
}

/*
 * The reader is the person who owns the deployment, so the message names the
 * lever they actually have rather than apologising in the abstract.
 */
export function describeAiFailure(message: string): string {
  switch (classifyAiFailure(message)) {
    case "credit":
      return "Sartho's AI provider has run out of credit, so it could not read the document. Nothing is wrong with your résumé. Top up the provider account — or set a second provider key — and upload it again.";
    case "auth":
      return "Sartho's AI provider rejected its key, so it could not read the document. The key needs correcting in the deployment's environment variables.";
    case "rate-limit":
      return "Sartho's AI provider is refusing requests for the moment. Nothing is wrong with your résumé — wait a minute and upload it again.";
    case "timeout":
      return "Reading the document took longer than Sartho waits. Try it again, and if it keeps happening the document may be unusually long.";
    default:
      return message;
  }
}
