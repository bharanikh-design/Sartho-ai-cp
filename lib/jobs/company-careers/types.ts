/*
 * Types for direct company career portal ingestion (Workday, Greenhouse, Lever).
 */

export type ATSProviderType = "workday" | "greenhouse" | "lever";

export type EmployerPortalConfig = {
  id: string;
  name: string;
  aliases: string[];
  type: ATSProviderType;
  /** Primary tenant identifier (e.g. "pwc", "deloitte", "canva"). */
  tenant: string;
  /** Workday site name (e.g. "Campus_Careers", "Careers"). */
  site?: string;
  /**
   * The full Workday host, e.g. "cba.wd3.myworkdayjobs.com". Every Workday
   * career site sits on a data-centre host (wd1, wd3, wd103, ...), so a
   * registry entry must carry it: the "<tenant>.myworkdayjobs.com" fallback
   * resolves for nobody. Saved sources always have it, from the pasted URL.
   */
  domain?: string;
  /** ISO-3166 alpha-2 countries supported by this portal config. */
  countries?: string[];
};

export type DirectCareerQuery = {
  employer: string;
  searchText: string;
  country?: string;
  location?: string;
  limit?: number;
};
