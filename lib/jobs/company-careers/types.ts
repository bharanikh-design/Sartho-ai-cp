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
  /** Default domain if different from standard myworkdayjobs.com. */
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
