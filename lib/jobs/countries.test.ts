import { describe, expect, it } from "vitest";
import { JOB_MARKETS, cityOptions, countryName, majorCities, normaliseCountryCode, regionLabel, regionOptions } from "./countries";

describe("job markets", () => {
  it("normalises codes and maps uk to gb", () => {
    expect(normaliseCountryCode(" AU ")).toBe("au");
    expect(normaliseCountryCode("UK")).toBe("gb");
    expect(normaliseCountryCode("zz")).toBeNull();
    expect(normaliseCountryCode(null)).toBeNull();
  });

  it("names a market and lists its major cities", () => {
    expect(countryName("au")).toBe("Australia");
    expect(majorCities("au")).toContain("Sydney");
    expect(majorCities("AU")).toContain("Melbourne");
    expect(majorCities("zz")).toEqual([]);
  });
});

/*
 * Someone open to anywhere in New South Wales had to name Sydney, Newcastle,
 * Wollongong and Parramatta one by one — four chips, and four separate provider
 * queries out of a small budget, to say one thing.
 */
describe("regions", () => {
  it("offers states where that is how people say where they will work", () => {
    expect(regionOptions("AU")).toContain("New South Wales");
    expect(regionOptions("au")).toContain("Victoria");
    expect(regionLabel("au")).toBe("States & territories");
    expect(regionOptions("ca")).toContain("British Columbia");
    expect(regionOptions("gb")).toContain("Scotland");
    expect(regionOptions("in")).toContain("Karnataka");
  });

  /*
   * A picker that offers a distinction people do not make is noise. Singapore
   * and Hong Kong are city-states; New Zealand's regions carry the same names
   * as its cities, so offering both would be two ways to say one thing.
   */
  it("offers none where a region is the country, or repeats the city", () => {
    for (const code of ["sg", "hk", "nz", "de", "br", "fr"]) {
      expect(regionOptions(code)).toEqual([]);
      expect(regionLabel(code)).toBeNull();
    }
  });

  it("never offers a region that reads the same as one of its own cities", () => {
    for (const market of JOB_MARKETS) {
      const cities = new Set(cityOptions(market.code).map((city) => city.toLowerCase()));
      const clashes = regionOptions(market.code).filter((region) => cities.has(region.toLowerCase()));
      /*
       * New York and Washington DC are cities in this list, so the states are
       * "New York State" and "Washington State". A chip that might mean either
       * is worse than no chip.
       */
      expect(clashes, `${market.code} offers the same name as a city and a region`).toEqual([]);
    }
  });

  it("has no duplicates inside a market", () => {
    for (const market of JOB_MARKETS) {
      const regions = regionOptions(market.code);
      expect(new Set(regions).size).toBe(regions.length);
    }
  });

  it("returns nothing for a market it does not know", () => {
    expect(regionOptions("zz")).toEqual([]);
    expect(regionOptions(null)).toEqual([]);
    expect(regionLabel(undefined)).toBeNull();
  });
});
