import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { normaliseCountryCode } from "@/lib/jobs/countries";
import { isEmploymentType } from "@/lib/jobs/employment-types";
import { normaliseExperienceBand } from "@/lib/jobs/experience";

import { searchPlanSchema } from "./schema";

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function PUT(request: Request) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  const parsed = searchPlanSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Review the search plan fields." }, { status: 400 });
  const { error } = await supabase.from("search_preferences").upsert({
    user_id: user.id,
    // The primary market stays on `country` for everything that reads one.
    country: parsed.data.countries[0] ?? parsed.data.country,
    countries: parsed.data.countries.length
      ? parsed.data.countries
      : parsed.data.country ? [parsed.data.country] : [],
    employment_types: parsed.data.employmentTypes,
    target_locations: dedupe(parsed.data.targetLocations),
    target_companies: dedupe(parsed.data.targetCompanies),
    experience_level: parsed.data.experienceLevel,
    remote_preference: parsed.data.remotePreferences.join(","),
    sources: parsed.data.sources,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Unable to save search strategy", error);
    return NextResponse.json({ error: "Sartho could not save your search strategy." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
