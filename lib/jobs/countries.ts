/*
 * The job markets Sartho can search, keyed by ISO-3166 alpha-2.
 *
 * Country is a per-user choice — the market someone wants to work in, which is
 * not always where they live today. It is the first and hardest filter on a
 * search: every provider scopes results to a country before any keyword or
 * city is considered, so getting it wrong returns a confident page of jobs on
 * the wrong continent. The list is deliberately curated to markets where at
 * least one provider returns real coverage.
 */

export type JobMarket = {
  code: string;
  name: string;
};

export const JOB_MARKETS: JobMarket[] = [
  { code: "au", name: "Australia" },
  { code: "nz", name: "New Zealand" },
  { code: "sg", name: "Singapore" },
  { code: "in", name: "India" },
  { code: "ae", name: "United Arab Emirates" },
  { code: "gb", name: "United Kingdom" },
  { code: "ie", name: "Ireland" },
  { code: "us", name: "United States" },
  { code: "ca", name: "Canada" },
  { code: "de", name: "Germany" },
  { code: "nl", name: "Netherlands" },
  { code: "fr", name: "France" },
  { code: "es", name: "Spain" },
  { code: "it", name: "Italy" },
  { code: "ch", name: "Switzerland" },
  { code: "at", name: "Austria" },
  { code: "be", name: "Belgium" },
  { code: "pl", name: "Poland" },
  { code: "za", name: "South Africa" },
  { code: "hk", name: "Hong Kong" },
  { code: "my", name: "Malaysia" },
  { code: "jp", name: "Japan" },
  { code: "br", name: "Brazil" },
  { code: "mx", name: "Mexico" },
];

const byCode = new Map(JOB_MARKETS.map((market) => [market.code, market]));

/** Lower-cased, "uk" → "gb"; null when the value is not a market Sartho knows. */
export function normaliseCountryCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").trim().toLowerCase();
  const mapped = code === "uk" ? "gb" : code;
  return byCode.has(mapped) ? mapped : null;
}

export function countryName(code: string | null | undefined): string | null {
  const normalised = normaliseCountryCode(code);
  return normalised ? byCode.get(normalised)?.name ?? null : null;
}
