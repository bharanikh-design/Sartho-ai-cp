import { describe, expect, it } from "vitest";
import { mintState, readState } from "@/lib/integrations/state";

const SECRET = "a-client-secret";
const USER = "11111111-2222-3333-4444-555555555555";

/*
 * This is the only thing standing between the OAuth callback and a
 * cross-site request forgery.
 *
 * Without it, anybody can send a signed-in Sartho user to the callback with a
 * `code` from their own Google account, and Sartho attaches the attacker's
 * Drive to the victim's profile. The victim then imports a résumé the attacker
 * controls. Everything below is that one attack, from a different angle each
 * time.
 */
describe("the OAuth state", () => {
  it("round-trips the user it was minted for", () => {
    expect(readState(mintState(USER, SECRET), SECRET)).toBe(USER);
  });

  it("refuses a state signed with a different secret", () => {
    expect(readState(mintState(USER, "someone-elses-secret"), SECRET)).toBeNull();
  });

  /* The payload is readable base64 — so it has to be the signature that binds it. */
  it("refuses a payload that was edited after signing", () => {
    const state = mintState(USER, SECRET);
    const [payload, signature] = state.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u: string };
    decoded.u = "99999999-9999-9999-9999-999999999999";
    const forged = `${Buffer.from(JSON.stringify(decoded)).toString("base64url")}.${signature}`;
    expect(readState(forged, SECRET)).toBeNull();
  });

  it("refuses a state that has gone stale", () => {
    const minted = Date.now();
    const state = mintState(USER, SECRET, minted);
    expect(readState(state, SECRET, minted + 9 * 60 * 1000)).toBe(USER);
    expect(readState(state, SECRET, minted + 11 * 60 * 1000)).toBeNull();
  });

  /* A clock that disagrees is not a licence to accept anything. */
  it("refuses a state minted in the future", () => {
    const now = Date.now();
    expect(readState(mintState(USER, SECRET, now + 10 * 60 * 1000), SECRET, now)).toBeNull();
  });

  it("refuses junk rather than throwing on it", () => {
    for (const bad of ["", ".", "nosignature", "a.b", "....", "%%%.%%%"]) {
      expect(readState(bad, SECRET)).toBeNull();
    }
    // @ts-expect-error deliberately wrong: this arrives from a query string
    expect(readState(null, SECRET)).toBeNull();
  });

  it("mints a different state each time, so one cannot be replayed as another", () => {
    const now = Date.now();
    expect(mintState(USER, SECRET, now)).not.toBe(mintState(USER, SECRET, now));
  });
});
