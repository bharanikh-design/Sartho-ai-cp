import { afterEach, describe, expect, it } from "vitest";
import { isAuthorisedCronRequest } from "./cron-secret";

const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/daily-digest", {
    headers: authorization === undefined ? {} : { authorization },
  });

const original = process.env.CRON_SECRET;

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe("isAuthorisedCronRequest", () => {
  it("accepts the configured secret as a bearer token", () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect(isAuthorisedCronRequest(request("Bearer s3cret-value"))).toBe(true);
    expect(isAuthorisedCronRequest(request("bearer s3cret-value"))).toBe(true);
  });

  it("refuses a wrong, partial or differently sized token", () => {
    process.env.CRON_SECRET = "s3cret-value";
    expect(isAuthorisedCronRequest(request("Bearer s3cret-valu"))).toBe(false);
    expect(isAuthorisedCronRequest(request("Bearer s3cret-value-and-more"))).toBe(false);
    expect(isAuthorisedCronRequest(request("Bearer x3cret-value"))).toBe(false);
    expect(isAuthorisedCronRequest(request("s3cret-value"))).toBe(false);
    expect(isAuthorisedCronRequest(request())).toBe(false);
  });

  /* Fails closed: an unset secret authorises nobody, not everybody. */
  it("refuses everything when no secret is configured", () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorisedCronRequest(request("Bearer "))).toBe(false);
    expect(isAuthorisedCronRequest(request("Bearer undefined"))).toBe(false);
    process.env.CRON_SECRET = "   ";
    expect(isAuthorisedCronRequest(request("Bearer    "))).toBe(false);
  });
});
