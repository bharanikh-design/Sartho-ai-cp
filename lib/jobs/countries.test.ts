import { describe, expect, it } from "vitest";
import { countryName, majorCities, normaliseCountryCode } from "./countries";

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
