import { describe, expect, it } from "vitest";
import {
  DEFAULT_MARKET,
  RESUME_MARKETS,
  normaliseMarket,
  pageSizeFor,
  resumeMarket,
} from "./markets";
import { RESUME_TEMPLATE_IDS } from "./templates";

describe("market profiles", () => {
  it("falls back rather than rejecting an unknown market", () => {
    expect(normaliseMarket("us")).toBe("us");
    expect(normaliseMarket("atlantis")).toBe(DEFAULT_MARKET);
    expect(normaliseMarket(null)).toBe(DEFAULT_MARKET);
    expect(normaliseMarket(undefined)).toBe(DEFAULT_MARKET);
    expect(normaliseMarket(42)).toBe(DEFAULT_MARKET);
    expect(resumeMarket("nonsense").id).toBe(DEFAULT_MARKET);
  });

  /*
   * The whole point of the table. A résumé for the United States prints on
   * Letter; the renderer hardcoded A4 for everybody until now.
   */
  it("gives the United States Letter and everywhere else A4", () => {
    expect(pageSizeFor("us")).toBe("LETTER");
    for (const market of RESUME_MARKETS.filter((entry) => entry.id !== "us")) {
      expect(pageSizeFor(market.id), market.name).toBe("A4");
    }
    expect(pageSizeFor("nonsense")).toBe("A4");
  });

  /*
   * Every market names templates it suits, and a name that no longer exists
   * would quietly recommend nothing — which is how a recommendation feature
   * rots without anybody noticing.
   */
  it("only recommends templates that exist", () => {
    for (const market of RESUME_MARKETS) {
      expect(market.winners.length, market.name).toBeGreaterThan(0);
      for (const winner of market.winners) {
        expect(RESUME_TEMPLATE_IDS, `${market.name} recommends ${winner}`).toContain(winner);
      }
    }
  });

  it("says something useful about every market", () => {
    for (const market of RESUME_MARKETS) {
      expect(market.length.length, market.name).toBeGreaterThan(10);
      expect(market.guidance.length, market.name).toBeGreaterThan(10);
      expect(market.personalDetails.length, market.name).toBeGreaterThan(10);
    }
  });
});
