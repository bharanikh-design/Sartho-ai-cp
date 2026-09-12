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

export type AiFailureKind = "credit" | "rate-limit" | "auth" | "timeout" | "model" | "unknown";

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
  /*
   * \b429\b, not a bare 429. Google's refusals carry a numeric project id, and
   * "Generative Language API has not been used in project 429174" was being
   * read as a rate limit because those three digits appear inside it — so a
   * misconfigured project told the user to wait a minute and try again, for
   * ever. Same reason 401 below is bounded.
   */
  if (/rate.?limit|too many requests|\b429\b|overloaded|capacity|exhausted/.test(text)) return "rate-limit";
  /*
   * An API that was never switched on for the key's project is an
   * authentication problem in every way that matters: the request is refused,
   * no model will help, and the person who can fix it is the one holding the
   * deployment's environment variables.
   */
  if (/invalid.*api key|api key not valid|api_key_invalid|incorrect api key|unauthorized|permission_denied|\b401\b|authentication|has not been used in project|api has not been enabled|accessnotconfigured|api_key_service_blocked/.test(text)) return "auth";
  if (/timed? ?out|timeout|aborted|abort/.test(text)) return "timeout";
  /*
   * Google's retired-model reply is "models/gemini-1.5-pro is not found for
   * API version v1beta", not the tidier "model not found". That wording used
   * to reach the upload screen verbatim, twice, because nothing recognised it.
   */
  if (
    /is not found for api version|not supported for generatecontent|model not found|model is not found|no longer available|limit:\s*0\b/.test(text)
  ) {
    return "model";
  }
  return "unknown";
}

/*
 * What the provider was being asked to do, so the sentence fits where it is
 * shown.
 *
 * This wording was written for the résumé upload and said so — "could not read
 * the document", "nothing is wrong with your résumé". Shown beside a single
 * bullet in the Studio, that is about a different thing entirely, which is part
 * of why the rewrite route stopped using it and invented its own dead-end
 * message instead. The classification is the reusable part; the noun is not.
 */
export type AiFailureSubject = {
  /** What the provider could not do: "read the document", "rewrite that line". */
  action: string;
  /** What is definitely not at fault: "your résumé", "your draft". */
  reassurance: string;
  /** What the person should do again: "upload it again", "try it again". */
  retry: string;
};

export const DOCUMENT_SUBJECT: AiFailureSubject = {
  action: "read the document",
  reassurance: "your résumé",
  retry: "upload it again",
};

/*
 * The default, and deliberately about nothing in particular.
 *
 * DOCUMENT_SUBJECT used to hold this slot, and lib/ai/provider formats every
 * failure it raises — so a résumé that could not be *built*, an advert that
 * could not be analysed and a line that could not be rewritten all told the
 * person that Sartho "could not read the document" and that they should
 * "upload it again". The noun was wrong and the instruction did nothing: there
 * was no document, and uploading one would not have helped.
 *
 * A caller that knows what it was doing passes its own subject and gets a
 * sentence that fits. A caller that does not gets one that is at least true.
 */
export const GENERIC_SUBJECT: AiFailureSubject = {
  action: "finish that request",
  reassurance: "your data",
  retry: "try again",
};

export const RESUME_BUILD_SUBJECT: AiFailureSubject = {
  action: "build the résumé",
  reassurance: "your evidence",
  retry: "try again",
};

export const REWRITE_SUBJECT: AiFailureSubject = {
  action: "rewrite that line",
  reassurance: "your draft",
  retry: "try it again",
};

/*
 * The reader is the person who owns the deployment, so the message names the
 * lever they actually have rather than apologising in the abstract.
 */
export function describeAiFailure(message: string, subject: AiFailureSubject = GENERIC_SUBJECT): string {
  const { action, reassurance, retry } = subject;
  switch (classifyAiFailure(message)) {
    case "credit":
      return `Sartho's selected AI provider has run out of credit, so it could not ${action}. Nothing is wrong with ${reassurance}. Top up the provider account and ${retry}.`;
    case "auth":
      return `Sartho's AI provider refused the request because of its key, so it could not ${action}. Either the key is wrong or the provider's API is not enabled for its project; both are fixed in the deployment's environment variables and provider console.`;
    case "rate-limit":
      return `Sartho's AI provider is refusing requests for the moment. Nothing is wrong with ${reassurance} — wait a minute and ${retry}.`;
    case "timeout":
      return `Sartho waited as long as it waits and the provider did not answer, so it could not ${action}. Nothing is wrong with ${reassurance} — ${retry}.`;
    case "model":
      return `Sartho's selected AI model is no longer available, so it could not ${action}. Nothing is wrong with ${reassurance}. The administrator needs to set a current model name in the deployment's environment variables.`;
    default:
      // The raw provider message is logged server-side for diagnostics; it must
      // never be printed to the person using the product — it reads as a Sartho
      // bug and can leak internal request IDs and provider URLs.
      return `Sartho's AI provider could not ${action}. Nothing is wrong with ${reassurance}. Try again, and if it continues ask the Sartho administrator to check the provider.`;
  }
}

export function shortAiFailure(message: string): string {
  switch (classifyAiFailure(message)) {
    case "credit": return "no credit left";
    case "auth": return "key rejected";
    case "rate-limit": return "rate limited";
    case "timeout": return "timed out";
    case "model": return "model no longer available";
    default: return "provider error";
  }
}

