/*
 * Registry of known enterprise and tier-1 employers with direct ATS career endpoints.
 */

import type { JobSearchResult } from "@/lib/jobs/search-provider";
import type { DirectCareerQuery, EmployerPortalConfig } from "./types";
import { searchWorkdayPortal } from "./workday";
import { searchGreenhousePortal } from "./greenhouse";
import { searchLeverPortal } from "./lever";

/*
 * Every Workday career site lives on a data-centre host — pwc.wd3, cba.wd3,
 * accenture.wd103 — and "<tenant>.myworkdayjobs.com" resolves for nobody. The
 * seven Workday employers this list used to hold all lacked that host, so not
 * one of them had ever answered a search: every brief naming PwC or Accenture
 * logged a DNS failure and quietly got nothing from the portal. The hosts and
 * site names below come from the employers' own indexed job postings.
 *
 * Deloitte, KPMG, EY and Macquarie Group are gone rather than guessed: their
 * indexed postings show no Workday careers site for any of them (Deloitte has
 * only regional tenants, and the Workday "Macquarie" is the university), so an
 * entry here could only ever fail. An employer this list does not know is
 * reported as unknown, and the person can paste the real careers URL on the
 * Search Brief, which wins over this list anyway.
 */
export const EMPLOYER_PORTALS: EmployerPortalConfig[] = [
  {
    id: "pwc",
    name: "PwC",
    aliases: ["pwc", "pricewaterhousecoopers", "price waterhouse coopers"],
    type: "workday",
    tenant: "pwc",
    site: "Global_Experienced_Careers",
    domain: "pwc.wd3.myworkdayjobs.com",
  },
  {
    id: "accenture",
    name: "Accenture",
    aliases: ["accenture"],
    type: "workday",
    tenant: "accenture",
    site: "AccentureCareers",
    domain: "accenture.wd103.myworkdayjobs.com",
  },
  {
    id: "cba",
    name: "Commonwealth Bank",
    aliases: ["cba", "commonwealth bank", "commbank"],
    type: "workday",
    tenant: "cba",
    site: "CommBank_Careers",
    domain: "cba.wd3.myworkdayjobs.com",
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
 * They win over this file's hardcoded companies deliberately: a person
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
