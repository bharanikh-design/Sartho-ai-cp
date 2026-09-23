import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { discoverCareersSource } from "@/lib/jobs/company-careers/discovery";
import { searchGreenhousePortal } from "@/lib/jobs/company-careers/greenhouse";
import { searchLeverPortal } from "@/lib/jobs/company-careers/lever";
import { searchWorkdayPortal } from "@/lib/jobs/company-careers/workday";
import type { EmployerPortalConfig } from "@/lib/jobs/company-careers/types";

export async function POST(request: Request) {
  const { user } = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Sign in to test an employer careers source." }, { status: 401 });

  const body = await request.json().catch(() => null) as { employer?: string; url?: string } | null;
  const employer = body?.employer?.trim();
  const rawUrl = body?.url?.trim();
  if (!employer || !rawUrl) return NextResponse.json({ error: "Employer and careers URL are required." }, { status: 400 });

  let discovery;
  try { discovery = discoverCareersSource(rawUrl); }
  catch { return NextResponse.json({ status: "unknown", error: "That is not a valid careers URL." }, { status: 400 }); }

  if (discovery.kind === "unknown" || !discovery.tenant) {
    return NextResponse.json({ status: "unknown", provider: null, message: "Sartho cannot verify this careers system yet. Keep the URL; use the browser extension for roles from this site." });
  }

  const config: EmployerPortalConfig = {
    id: employer.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name: employer,
    aliases: [employer],
    type: discovery.kind,
    tenant: discovery.tenant,
    site: discovery.site ?? undefined,
    domain: discovery.kind === "workday" ? discovery.domain : undefined,
  };

  try {
    const query = { employer, searchText: "", limit: 5 };
    const jobs = discovery.kind === "workday"
      ? await searchWorkdayPortal(config, query)
      : discovery.kind === "greenhouse"
        ? await searchGreenhousePortal(config, query)
        : await searchLeverPortal(config, query);
    return NextResponse.json({
      status: "healthy", provider: discovery.kind, careersUrl: discovery.careersUrl,
      jobsFound: jobs.length, sample: jobs.slice(0, 3).map((job) => ({ title: job.title, location: job.location })),
      message: jobs.length ? "Connection verified with live vacancies." : "Careers system verified, but no vacancies were returned in this check.",
    });
  } catch (error) {
    return NextResponse.json({ status: "degraded", provider: discovery.kind, jobsFound: 0, message: error instanceof Error ? error.message : "The careers source could not be reached." });
  }
}
