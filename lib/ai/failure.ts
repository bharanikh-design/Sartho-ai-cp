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

  /*
   * Every alternative here is wording a provider actually used. Two of them
   * were added after a test caught the classifier missing them: Google says
   * "API key not valid", not "invalid API key"; and Anthropic's shorter refusal
   * says "credit balance is too low" without the word billing anywhere in it.
   * A near miss reads as an unrecognised failure and gets passed through raw,
   * which is the behaviour this whole file exists to prevent.
   */
  if (/insufficient_quota|no credits|no credit left|run out of credit|credit balance|purchase credits|top up|exceeded your current quota|billing|payment|check your plan/.test(text)) {
    return "credit";
  }
  if (/rate.?limit|too many requests|429|overloaded|capacity|exhausted/.test(text)) return "rate-limit";
  if (/invalid.*api key|api key not valid|api_key_invalid|incorrect api key|unauthorized|permission_denied|401|authentication/.test(text)) return "auth";
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
      return "Sartho's selected AI provider has run out of credit, so it could not read the document. Nothing is wrong with your résumé. Top up the provider account and upload it again.";
    case "auth":
      return "Sartho's AI provider rejected its key, so it could not read the document. The key needs correcting in the deployment's environment variables.";
    case "rate-limit":
      return "Sartho's AI provider is refusing requests for the moment. Nothing is wrong with your résumé — wait a minute and upload it again.";
    case "timeout":
      return "Reading the document took longer than Sartho waits. Try it again, and if it keeps happening the document may be unusually long.";
    default:
      return "Sartho's AI provider could not read the document. Nothing is wrong with your résumé. Try again, and if it continues ask the Sartho administrator to check the provider.";
  }
}

export function shortAiFailure(message: string): string {
  switch (classifyAiFailure(message)) {
    case "credit": return "no credit left";
    case "auth": return "key rejected";
    case "rate-limit": return "rate limited";
    case "timeout": return "timed out";
    default: return "provider error";
  }
}

