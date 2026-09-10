/*
 * Registry of known enterprise and tier-1 employers with direct ATS career endpoints.
 */

import type { JobSearchResult } from "@/lib/jobs/search-provider";
import type { DirectCareerQuery, EmployerPortalConfig } from "./types";
import { searchWorkdayPortal } from "./workday";
import { searchGreenhousePortal } from "./greenhouse";

export const EMPLOYER_PORTALS: EmployerPortalConfig[] = [
  {
    id: "pwc",
    name: "PwC",
    aliases: ["pwc", "pricewaterhousecoopers", "price waterhouse coopers"],
    type: "workday",
    tenant: "pwc",
    site: "Campus_Careers",
  },
  {
    id: "deloitte",
    name: "Deloitte",
    aliases: ["deloitte", "deloitte consulting", "deloitte touche", "deloitte & touche"],
    type: "workday",
    tenant: "deloitte",
    site: "Deloitte_Careers",
  },
  {
    id: "kpmg",
    name: "KPMG",
    aliases: ["kpmg"],
    type: "workday",
    tenant: "kpmg",
    site: "KPMG_Careers",
  },
  {
    id: "ey",
    name: "EY",
    aliases: ["ey", "ernst & young", "ernst and young"],
    type: "workday",
    tenant: "ey",
    site: "EY_Careers",
  },
  {
    id: "accenture",
    name: "Accenture",
    aliases: ["accenture"],
    type: "workday",
    tenant: "accenture",
    site: "Accenture_Careers",
  },
  {
    id: "macquarie",
    name: "Macquarie Group",
    aliases: ["macquarie", "macquarie group", "macquarie bank"],
    type: "workday",
    tenant: "macquarie",
    site: "Macquarie_Careers",
  },
  {
    id: "cba",
    name: "Commonwealth Bank",
    aliases: ["cba", "commonwealth bank", "commbank"],
    type: "workday",
    tenant: "cba",
    site: "CBA_Careers",
  },
  {
    id: "canva",
    name: "Canva",
    aliases: ["canva"],
    type: "greenhouse",
    tenant: "canva",
  },
  {
    id: "stripe",
    name: "Stripe",
    aliases: ["stripe"],
    type: "greenhouse",
    tenant: "stripe",
  },
];

export function findEmployerPortal(employerName: string): EmployerPortalConfig | null {
  const clean = employerName.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!clean) return null;

  return (
    EMPLOYER_PORTALS.find((portal) => {
      const idMatch = portal.id.toLowerCase() === clean;
      const nameMatch = portal.name.toLowerCase().replace(/[^a-z0-9]/g, "") === clean;
      const aliasMatch = portal.aliases.some((alias) => alias.toLowerCase().replace(/[^a-z0-9]/g, "") === clean);
      return idMatch || nameMatch || aliasMatch;
    }) ?? null
  );
}

export async function searchEmployerDirectly(
  employerName: string,
  query: DirectCareerQuery,
): Promise<JobSearchResult[]> {
  const portal = findEmployerPortal(employerName);
  if (!portal) return [];

  if (portal.type === "workday") {
    return searchWorkdayPortal(portal, query);
  }
  if (portal.type === "greenhouse") {
    return searchGreenhousePortal(portal, query);
  }
  return [];
}
