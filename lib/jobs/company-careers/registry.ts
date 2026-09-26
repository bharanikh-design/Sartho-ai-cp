/*
 * Registry of known enterprise and tier-1 employers with direct ATS career endpoints.
 */

import type { JobSearchResult } from "@/lib/jobs/search-provider";
import type { DirectCareerQuery, EmployerPortalConfig } from "./types";
import { searchWorkdayPortal } from "./workday";
import { searchGreenhousePortal } from "./greenhouse";
import { searchLeverPortal } from "./lever";

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

/**
 * Lower-case alphanumerics, so punctuation and casing cannot lose a match.
 *
 * Accents are folded rather than deleted. Stripping them outright turned
 * "AtkinsRéalis" into "atkinsralis", which matches nothing a person would
 * type — and an employer saved with its proper spelling would then never be
 * found by the chip they typed without it. Folding makes both sides
 * "atkinsrealis". The hardcoded list below happens to hold no accented names,
 * which is why this never showed up before somebody could save their own.
 */
export function employerKey(employerName: string): string {
  return employerName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The careers portal for an employer, preferring the person's own.
 *
 * `saved` holds the sources somebody verified themselves on the Search Brief.
 * They win over this file's nine hardcoded companies deliberately: a person
 * who pasted their employer's careers URL and watched Sartho prove it knows
 * their target better than a static list compiled here does, and they may well
 * mean a different tenant of a company this list already names.
 */
export function findEmployerPortal(
  employerName: string,
  saved: EmployerPortalConfig[] = [],
): EmployerPortalConfig | null {
  const clean = employerKey(employerName);
  if (!clean) return null;

  const matches = (portal: EmployerPortalConfig) => {
    const idMatch = portal.id.toLowerCase() === clean;
    const nameMatch = employerKey(portal.name) === clean;
    const aliasMatch = portal.aliases.some((alias) => employerKey(alias) === clean);
    return idMatch || nameMatch || aliasMatch;
  };

  return saved.find(matches) ?? EMPLOYER_PORTALS.find(matches) ?? null;
}

export async function searchEmployerDirectly(
  employerName: string,
  query: DirectCareerQuery,
  saved: EmployerPortalConfig[] = [],
): Promise<JobSearchResult[]> {
  const portal = findEmployerPortal(employerName, saved);
  if (!portal) return [];

  if (portal.type === "workday") {
    return searchWorkdayPortal(portal, query);
  }
  if (portal.type === "greenhouse") {
    return searchGreenhousePortal(portal, query);
  }
  /*
   * Lever was imported here and never called, so a Lever careers page could be
   * verified on the Search Brief and then searched zero times — the one ATS
   * where "✓ Connected" was guaranteed to lead nowhere.
   */
  if (portal.type === "lever") {
    return searchLeverPortal(portal, query);
  }
  return [];
}
