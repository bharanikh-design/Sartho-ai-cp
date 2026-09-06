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

/*
 * The cities where most of a market's roles are posted. Offered as one-tap
 * additions on Search Brief and used to explain widening ("Sydney was thin, so
 * the rest of Australia was searched too"). Not exhaustive; a person can type
 * any city.
 */
const MAJOR_CITIES: Record<string, string[]> = {
  au: ["Sydney", "Melbourne", "Brisbane", "Perth", "Adelaide", "Canberra"],
  nz: ["Auckland", "Wellington", "Christchurch"],
  sg: ["Singapore"],
  in: ["Bengaluru", "Hyderabad", "Mumbai", "Pune", "Chennai", "Delhi NCR", "Gurugram"],
  ae: ["Dubai", "Abu Dhabi"],
  gb: ["London", "Manchester", "Birmingham", "Edinburgh", "Leeds", "Bristol"],
  ie: ["Dublin", "Cork"],
  us: ["New York", "San Francisco", "Seattle", "Austin", "Chicago", "Boston", "Los Angeles"],
  ca: ["Toronto", "Vancouver", "Montreal", "Calgary"],
  de: ["Berlin", "Munich", "Frankfurt", "Hamburg"],
  nl: ["Amsterdam", "Rotterdam", "Utrecht"],
  fr: ["Paris", "Lyon"],
  es: ["Madrid", "Barcelona"],
  it: ["Milan", "Rome"],
  ch: ["Zurich", "Geneva"],
  at: ["Vienna"],
  be: ["Brussels", "Antwerp"],
  pl: ["Warsaw", "Krakow"],
  za: ["Johannesburg", "Cape Town"],
  hk: ["Hong Kong"],
  my: ["Kuala Lumpur"],
  jp: ["Tokyo", "Osaka"],
  br: ["São Paulo", "Rio de Janeiro"],
  mx: ["Mexico City", "Guadalajara", "Monterrey"],
};

export function majorCities(code: string | null | undefined): string[] {
  const normalised = normaliseCountryCode(code);
  return normalised ? MAJOR_CITIES[normalised] ?? [] : [];
}

/*
 * A wider list per market for type-ahead ("Bri" → Brisbane). Major cities come
 * first, then the next tier. Anything not here can still be typed in full.
 */
const MORE_CITIES: Record<string, string[]> = {
  au: ["Gold Coast", "Newcastle", "Wollongong", "Hobart", "Darwin", "Geelong", "Sunshine Coast", "Townsville", "Cairns", "Toowoomba", "Ballarat", "Bendigo", "Parramatta", "North Sydney", "Chatswood", "Macquarie Park", "Docklands", "Southbank", "Fortitude Valley", "Launceston"],
  nz: ["Hamilton", "Tauranga", "Dunedin", "Palmerston North", "Napier", "Nelson", "Queenstown"],
  in: ["Kolkata", "Noida", "Ahmedabad", "Kochi", "Chandigarh", "Jaipur", "Coimbatore", "Indore", "Thiruvananthapuram", "Bhubaneswar", "Nagpur", "Lucknow", "Mysuru", "Visakhapatnam", "Vadodara", "Surat"],
  ae: ["Sharjah", "Ajman", "Ras Al Khaimah"],
  gb: ["Glasgow", "Liverpool", "Cambridge", "Oxford", "Reading", "Sheffield", "Newcastle upon Tyne", "Nottingham", "Cardiff", "Belfast", "Milton Keynes", "Brighton", "Leicester", "Southampton", "Bath", "Coventry", "Aberdeen"],
  ie: ["Galway", "Limerick", "Waterford"],
  us: ["Denver", "Atlanta", "Dallas", "Houston", "Washington DC", "Philadelphia", "Phoenix", "San Diego", "San Jose", "Portland", "Miami", "Minneapolis", "Raleigh", "Charlotte", "Nashville", "Salt Lake City", "Detroit", "Pittsburgh", "Columbus", "Kansas City", "Tampa", "Orlando", "Sacramento", "Las Vegas", "Baltimore", "Indianapolis", "Cincinnati", "St. Louis", "Milwaukee", "Oakland"],
  ca: ["Ottawa", "Edmonton", "Winnipeg", "Quebec City", "Halifax", "Victoria", "Waterloo", "Mississauga", "Hamilton"],
  de: ["Cologne", "Stuttgart", "Düsseldorf", "Leipzig", "Dresden", "Hanover", "Nuremberg", "Karlsruhe", "Bonn"],
  nl: ["The Hague", "Eindhoven", "Groningen", "Leiden", "Delft"],
  fr: ["Marseille", "Toulouse", "Bordeaux", "Lille", "Nantes", "Nice", "Grenoble", "Strasbourg"],
  es: ["Valencia", "Seville", "Malaga", "Bilbao", "Zaragoza"],
  it: ["Turin", "Bologna", "Florence", "Naples"],
  ch: ["Basel", "Bern", "Lausanne", "Zug", "Lugano"],
  at: ["Graz", "Linz", "Salzburg"],
  be: ["Ghent", "Leuven"],
  pl: ["Wroclaw", "Gdansk", "Poznan", "Lodz", "Katowice"],
  za: ["Durban", "Pretoria", "Stellenbosch"],
  my: ["Penang", "Johor Bahru", "Cyberjaya", "Petaling Jaya"],
  jp: ["Nagoya", "Fukuoka", "Yokohama", "Kyoto", "Sapporo"],
  br: ["Belo Horizonte", "Brasília", "Curitiba", "Porto Alegre", "Florianópolis", "Campinas"],
  mx: ["Querétaro", "Tijuana", "Puebla"],
};

/** Every city Sartho can offer for a market, majors first. */
export function cityOptions(code: string | null | undefined): string[] {
  const normalised = normaliseCountryCode(code);
  if (!normalised) return [];
  return [...(MAJOR_CITIES[normalised] ?? []), ...(MORE_CITIES[normalised] ?? [])];
}

/*
 * States, provinces and nations — for the markets where that is how people
 * actually say where they will work.
 *
 * Someone open to anywhere in New South Wales had to name Sydney, Newcastle,
 * Wollongong and Parramatta one by one, and each of those is a separate
 * provider query out of a small budget. "New South Wales" is one query, one
 * chip, and the sentence they would have said out loud.
 *
 * Deliberately not offered everywhere. Singapore and Hong Kong are city-states
 * where a region is the country. New Zealand's regions carry the same names as
 * its cities — Auckland, Wellington — so offering both would be two ways to say
 * one thing. Germans and Brazilians name cities, not Länder or estados. A
 * picker that offers a distinction people do not make is noise, and this list
 * exists to be shorter than it could be.
 *
 * Providers take these as ordinary location text: Adzuna resolves a state name
 * against its own location hierarchy, and JSearch reads it as part of the
 * query. So nothing in the search engine needs to know a region from a city.
 */
export type RegionSet = {
  /** What this market calls them, used as the group heading in the picker. */
  label: string;
  regions: string[];
};

const REGIONS: Record<string, RegionSet> = {
  au: {
    label: "States & territories",
    regions: [
      "New South Wales", "Victoria", "Queensland", "Western Australia",
      "South Australia", "Tasmania", "Australian Capital Territory", "Northern Territory",
    ],
  },
  /*
   * "New York State" and "Washington State" rather than the bare names: New
   * York and Washington DC are already offered as cities, and a chip reading
   * "New York" that might mean either the city or the state is worse than no
   * chip at all.
   */
  us: {
    label: "States",
    regions: [
      "California", "New York State", "Texas", "Florida", "Illinois", "Massachusetts",
      "Washington State", "Colorado", "Georgia", "North Carolina", "Virginia", "Pennsylvania",
      "New Jersey", "Ohio", "Michigan", "Arizona", "Oregon", "Minnesota", "Tennessee",
      "Maryland", "Wisconsin", "Missouri", "Indiana", "Utah", "Nevada", "Connecticut",
      "Alabama", "South Carolina", "Louisiana", "Kentucky", "Oklahoma", "Iowa", "Kansas",
      "Arkansas", "Nebraska", "Mississippi", "New Mexico", "Idaho", "Hawaii", "Maine",
      "New Hampshire", "Rhode Island", "Montana", "Delaware", "South Dakota", "North Dakota",
      "Alaska", "Vermont", "Wyoming", "West Virginia",
    ],
  },
  ca: {
    label: "Provinces",
    regions: [
      "Ontario", "British Columbia", "Quebec", "Alberta", "Manitoba", "Saskatchewan",
      "Nova Scotia", "New Brunswick", "Newfoundland and Labrador", "Prince Edward Island",
    ],
  },
  gb: {
    label: "Nations & regions",
    regions: [
      "England", "Scotland", "Wales", "Northern Ireland", "Greater London",
      "South East England", "North West England", "Yorkshire", "West Midlands",
      "South West England", "East of England", "North East England", "East Midlands",
    ],
  },
  in: {
    label: "States",
    regions: [
      "Karnataka", "Maharashtra", "Telangana", "Tamil Nadu", "Uttar Pradesh", "Haryana",
      "Gujarat", "West Bengal", "Kerala", "Rajasthan", "Punjab", "Andhra Pradesh",
      "Madhya Pradesh", "Odisha", "Bihar", "Assam",
    ],
  },
};

/** The regions Sartho offers for a market, or none where the idea does not apply. */
export function regionOptions(code: string | null | undefined): string[] {
  const normalised = normaliseCountryCode(code);
  return normalised ? REGIONS[normalised]?.regions ?? [] : [];
}

/** What this market calls its regions, or null where none are offered. */
export function regionLabel(code: string | null | undefined): string | null {
  const normalised = normaliseCountryCode(code);
  return normalised ? REGIONS[normalised]?.label ?? null : null;
}

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
