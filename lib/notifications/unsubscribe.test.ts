import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from "./unsubscribe";

const USER = "0f7f3f1e-2b4a-4c8d-9e1f-3a5b7c9d1e2f";
const OTHER = "1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d";

const saved = { unsub: process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET, cron: process.env.CRON_SECRET };

beforeEach(() => {
  process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET = "unsubscribe-key";
  delete process.env.CRON_SECRET;
});

afterEach(() => {
  if (saved.unsub === undefined) delete process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET;
  else process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET = saved.unsub;
  if (saved.cron === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved.cron;
});

describe("unsubscribe tokens", () => {
  it("round-trips the account the token names", () => {
    const token = unsubscribeToken(USER);
    expect(token).toMatch(/^0f7f3f1e-[0-9a-f-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyUnsubscribeToken(token)).toBe(USER);
  });

  it("refuses a token for another account, a tampered one, or one signed with another key", () => {
    const token = unsubscribeToken(USER)!;
    const [, sig] = token.split(".");
    expect(verifyUnsubscribeToken(`${OTHER}.${sig}`)).toBeNull();
    expect(verifyUnsubscribeToken(`${USER}.${sig.slice(0, -2)}AA`)).toBeNull();
    expect(verifyUnsubscribeToken(`${USER}.`)).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
    expect(verifyUnsubscribeToken(null)).toBeNull();

    process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET = "a different key";
    expect(verifyUnsubscribeToken(token)).toBeNull();
  });

  it("falls back to CRON_SECRET and produces nothing with no key at all", () => {
    delete process.env.NOTIFICATIONS_UNSUBSCRIBE_SECRET;
    expect(unsubscribeToken(USER)).toBeNull();
    expect(unsubscribeUrl("https://sartho.tech/", USER)).toBeNull();

    process.env.CRON_SECRET = "cron-key";
    const url = unsubscribeUrl("https://sartho.tech/", USER)!;
    expect(url.startsWith("https://sartho.tech/api/notifications/unsubscribe?token=")).toBe(true);
    const token = decodeURIComponent(url.split("token=")[1]);
    expect(verifyUnsubscribeToken(token)).toBe(USER);
  });

  it("only signs a real user id", () => {
    expect(unsubscribeToken("not-a-uuid")).toBeNull();
  });
});
