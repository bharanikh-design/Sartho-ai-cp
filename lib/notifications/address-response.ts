import type { AddressOutcome, NotificationAddress } from "@/lib/notifications/address";

/*
 * What the browser is told about the address, and how each outcome of
 * changing it is answered. Shared by the address routes, the switch routes
 * and the settings page, so none of them describes the same state in
 * different words.
 */

export type AddressSummary = {
  /** The address in force: confirmed, and where the emails go. Null until one is. */
  confirmed: string | null;
  /** An address that has been sent a link and not yet clicked it. */
  awaitingConfirmation: string | null;
  verificationSentAt: string | null;
  digestEnabled: boolean;
  matchAlertsEnabled: boolean;
};

export function summariseAddress(address: NotificationAddress | null): AddressSummary | null {
  if (!address) return null;
  return {
    confirmed: address.verified ? address.email : null,
    awaitingConfirmation: address.awaitingConfirmation,
    verificationSentAt: address.verificationSentAt,
    digestEnabled: address.digestEnabled,
    matchAlertsEnabled: address.matchAlertsEnabled,
  };
}

/** The status and, for the outcomes that are failures, the words for them. */
export function describeAddressOutcome(outcome: AddressOutcome): { status: number; error?: string; code?: string } {
  switch (outcome.outcome) {
    case "verified":
    case "unchanged":
    case "confirmation_sent":
    case "already_sent":
      return { status: 200 };
    case "nothing_pending":
      return { status: 400, error: "Nothing is waiting to be confirmed.", code: "nothing_pending" };
    case "delivery_unavailable":
      return {
        status: 503,
        error: "Email delivery isn't connected, so Sartho can't send a confirmation link. Your sign-in address works without one.",
        code: "email_not_configured",
      };
    case "send_failed":
      return { status: 502, error: outcome.message, code: "email_failed" };
    case "failed":
      return { status: 500, error: "Sartho could not save that address.", code: "failed" };
  }
}
