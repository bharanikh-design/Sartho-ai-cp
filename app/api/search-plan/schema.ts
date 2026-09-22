import { z } from "zod";
import { normaliseCountryCode } from "@/lib/jobs/countries";
import { isEmploymentType } from "@/lib/jobs/employment-types";
import { normaliseExperienceBand } from "@/lib/jobs/experience";

export const searchPlanSchema = z.object({
  // The job market. Nullable so an older client that never sends it still
  // saves; the search route falls back to the résumé-inferred country.
  country: z.string().trim().min(2).max(2).nullable().optional()
    .transform((value) => (value ? normaliseCountryCode(value) : null)),
  // Cities within the country. May be empty: that means anywhere in the country.
  // Every market to search. The first is the primary one.
  countries: z.array(z.string().trim().min(2).max(2)).max(8).optional().default([])
    .transform((codes) => [...new Set(codes.map(normaliseCountryCode).filter((code): code is string => Boolean(code)))]),
  employmentTypes: z.array(z.string().trim().min(1).max(40)).max(8).optional().default([])
    .transform((types) => [...new Set(types.filter(isEmploymentType))]),
  targetLocations: z.array(z.string().trim().min(1).max(120)).max(20),
  targetCompanies: z.array(z.string().trim().min(1).max(120)).max(20).optional().default([]),
  // Years of experience, as one of four bands. Nullable and optional: a brief
  // saved before this existed still saves, and "not answered" is a real answer
  // that falls back to the résumé-derived total rather than to zero.
  experienceLevel: z.string().trim().max(10).nullable().optional()
    .transform((value) => normaliseExperienceBand(value)),
  remotePreferences: z.array(z.enum(["On-site", "Hybrid", "Remote", "Flexible"])).default([]),
  sources: z.array(z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(180), url: z.string().url().startsWith("https://"), type: z.string().max(100), coverage: z.string().max(100), trust: z.string().max(100), active: z.boolean() })).min(1).max(40)
    .refine((sources) => sources.some((source) => source.active), "Choose at least one active source."),
});

