/*
 * Employers offered as type-ahead on Search Brief, and used to recognise a
 * company name that was typed into the cities list before companies had their
 * own field. Not a whitelist: anything can still be typed in full.
 */

export const KNOWN_EMPLOYERS: string[] = [
  // Professional services
  "PwC", "Deloitte", "KPMG", "EY", "Accenture", "McKinsey & Company", "Boston Consulting Group", "Bain & Company",
  "Capgemini", "Oliver Wyman", "Kearney", "L.E.K. Consulting", "Roland Berger", "Strategy&", "Grant Thornton", "BDO",
  "Protiviti", "Slalom", "Nous Group", "Partners in Performance", "Mercer", "Marsh", "Aon", "Willis Towers Watson",
  // IT services
  "Infosys", "Tata Consultancy Services", "Wipro", "Cognizant", "HCLTech", "Tech Mahindra", "DXC Technology",
  "Fujitsu", "NTT Data", "Datacom", "Kinetic IT", "Thoughtworks", "Publicis Sapient", "IBM", "Capita", "Mphasis", "LTIMindtree",
  // Technology
  "Atlassian", "Canva", "Google", "Microsoft", "Amazon", "Amazon Web Services", "Apple", "Meta", "Salesforce", "ServiceNow",
  "SAP", "Oracle", "Adobe", "Cisco", "Dell Technologies", "HP", "Intel", "NVIDIA", "Uber", "Airbnb", "Stripe", "Shopify",
  "Xero", "WiseTech Global", "REA Group", "SEEK", "Afterpay", "Block", "Zip Co", "Tyro", "Culture Amp", "SafetyCulture",
  "Employment Hero", "Airwallex", "Linktree", "Rokt", "Deputy", "Go1", "Freelancer", "Nearmap", "Technology One", "Objective",
  "Workday", "Snowflake", "Databricks", "Palantir", "Zoho", "Freshworks", "Grab", "Sea", "Shopee", "Gojek", "Flipkart", "Paytm", "Zomato", "Swiggy",
  // Banking and finance
  "Commonwealth Bank", "Westpac", "NAB", "ANZ", "Macquarie Group", "Bendigo Bank", "Bank of Queensland", "Suncorp", "AMP",
  "HSBC", "Citi", "JPMorgan Chase", "Goldman Sachs", "Morgan Stanley", "Barclays", "Standard Chartered", "DBS", "OCBC", "UOB",
  "ICICI Bank", "HDFC Bank", "Axis Bank", "Kotak Mahindra Bank", "State Bank of India", "Emirates NBD", "First Abu Dhabi Bank",
  "Insurance Australia Group", "QBE", "Medibank", "Bupa", "Allianz", "AIA", "TAL", "AustralianSuper", "Aware Super", "Rest Super",
  "Australian Retirement Trust", "Challenger", "Zurich", "AXA", "Prudential", "Manulife", "Fidelity", "BlackRock", "Vanguard",
  // Retail and consumer
  "Woolworths Group", "Coles Group", "Wesfarmers", "Bunnings", "Kmart", "Officeworks", "JB Hi-Fi", "Harvey Norman", "Myer",
  "David Jones", "Endeavour Group", "Metcash", "Aldi", "IKEA", "Amazon Australia", "Cotton On", "Lovisa", "Unilever",
  "Procter & Gamble", "Nestlé", "Coca-Cola Europacific Partners", "Lion", "Treasury Wine Estates", "Reliance Retail", "Walmart", "Target", "Costco",
  // Telco, media, energy, transport, resources
  "Telstra", "Optus", "TPG Telecom", "Vodafone", "NBN Co", "Foxtel", "Nine", "Seven West Media", "News Corp", "ABC",
  "AGL", "Origin Energy", "EnergyAustralia", "Ausgrid", "Transurban", "Qantas", "Virgin Australia", "Sydney Airport",
  "Aurizon", "Linfox", "Toll Group", "Australia Post", "BHP", "Rio Tinto", "Fortescue", "Woodside", "Santos", "Newmont",
  "Orica", "Worley", "Downer", "CIMIC", "Lendlease", "Mirvac", "Stockland", "Goodman", "Dexus", "Aristocrat", "Tabcorp",
  "Shell", "BP", "Chevron", "ExxonMobil", "Siemens", "Schneider Electric", "ABB", "GE", "Boeing", "Airbus", "Tata Group", "Reliance Industries", "Adani Group", "Mahindra Group", "Aditya Birla Group",
  // Health, education, government
  "Ramsay Health Care", "Healthscope", "CSL", "Cochlear", "ResMed", "Sonic Healthcare", "NSW Health", "Queensland Health",
  "University of Sydney", "UNSW", "University of Melbourne", "Monash University", "UTS", "Macquarie University", "RMIT", "University of Queensland",
  "Australian Government", "NSW Government", "Victorian Government", "Queensland Government", "Services Australia", "Australian Taxation Office",
  "Department of Defence", "Digital Transformation Agency", "Reserve Bank of Australia", "APRA", "ASIC", "Transport for NSW",
];

const byLower = new Map(KNOWN_EMPLOYERS.map((name) => [name.toLowerCase(), name]));
const ALIASES: Record<string, string> = {
  pwc: "PwC", pwc_au: "PwC", "price waterhouse coopers": "PwC", pricewaterhousecoopers: "PwC",
  bcg: "Boston Consulting Group", mckinsey: "McKinsey & Company", bain: "Bain & Company",
  "ernst & young": "EY", "ernst and young": "EY", tcs: "Tata Consultancy Services", aws: "Amazon Web Services",
  cba: "Commonwealth Bank", commbank: "Commonwealth Bank", macquarie: "Macquarie Group", iag: "Insurance Australia Group",
  woolworths: "Woolworths Group", coles: "Coles Group", "atlassian pty": "Atlassian", "jp morgan": "JPMorgan Chase", jpmorgan: "JPMorgan Chase",
};

/** The canonical name when the text is a known employer (or alias); null otherwise. */
export function knownEmployer(text: string): string | null {
  const key = text.trim().toLowerCase();
  if (!key) return null;
  return byLower.get(key) ?? ALIASES[key] ?? null;
}

/**
 * Before companies had their own field, people typed "PwC" and "Deloitte" into
 * the cities list. Move any recognised employer across so a search does not
 * ask a jobs API for roles located in "Deloitte".
 */
export function splitMisfiledCompanies(locations: string[], companies: string[]) {
  const cities: string[] = [];
  const employers = [...companies];
  for (const item of locations) {
    const employer = knownEmployer(item);
    if (employer) {
      if (!employers.some((existing) => existing.toLowerCase() === employer.toLowerCase())) employers.push(employer);
    } else {
      cities.push(item);
    }
  }
  return { locations: cities, companies: employers, moved: locations.length - cities.length };
}
