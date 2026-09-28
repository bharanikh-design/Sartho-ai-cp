import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The throttle, against a recording stand-in for the email provider. A
 * provider that has spent its allowance stays spent for the month, and every
 * search in that month finds out again; the operator needs to hear it once.
 */

const sendEmail = vi.fn<(to: string, subject: string, html: string) => Promise<void>>(async () => undefined);
vi.mock("@/lib/notifications/send-email", () => ({
  isEmailDeliveryConfigured: () => true,
  sendEmail: (to: string, subject: string, html: string) => sendEmail(to, subject, html),
}));

const { notifyOperatorThrottled, resetOperatorAlertThrottle } = await import("./alerts");

const HOUR = 60 * 60 * 1000;

describe("notifyOperatorThrottled", () => {
  beforeEach(() => {
    resetOperatorAlertThrottle();
    sendEmail.mockClear();
    process.env.SARTHO_ALERT_EMAIL = "ops@example.com";
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    delete process.env.SARTHO_ALERT_EMAIL;
    vi.restoreAllMocks();
  });

  it("sends the first alert for a key and suppresses repeats inside the window", async () => {
    let now = 1_000_000;
    const alert = { key: "provider-retired:jsearch:spent_allowance", windowMs: 6 * HOUR, subject: "JSearch is out", lines: ["quota"], now: () => now };

    expect(await notifyOperatorThrottled(alert)).toBe("emailed");
    expect(await notifyOperatorThrottled(alert)).toBe("suppressed");
    now += 6 * HOUR - 1;
    expect(await notifyOperatorThrottled(alert)).toBe("suppressed");
    now += 1;
    expect(await notifyOperatorThrottled(alert)).toBe("emailed");
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("throttles per key, so one provider's silence does not hide another's", async () => {
    const now = () => 5_000_000;
    expect(await notifyOperatorThrottled({ key: "a", windowMs: HOUR, subject: "A", lines: [], now })).toBe("emailed");
    expect(await notifyOperatorThrottled({ key: "b", windowMs: HOUR, subject: "B", lines: [], now })).toBe("emailed");
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("still throttles when the alert can only be logged", async () => {
    delete process.env.SARTHO_ALERT_EMAIL;
    const now = () => 9_000_000;
    expect(await notifyOperatorThrottled({ key: "c", windowMs: HOUR, subject: "C", lines: [], now })).toBe("logged");
    expect(await notifyOperatorThrottled({ key: "c", windowMs: HOUR, subject: "C", lines: [], now })).toBe("suppressed");
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
