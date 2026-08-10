import { describe, expect, it } from "vitest";
import { buildProductJourney, type ProductJourneyInput } from "@/lib/journey/product-journey";
import type { ProfileRecord } from "@/lib/types";
import {
  buildCareerCommandCentre,
  type CommandCentreApplication,
  type CommandCentreJob,
} from "./command-centre";

const profile: ProfileRecord = {
  id: "user-1",
  full_name: "Example User",
  location: "Singapore",
  headline: "Transformation leader",
  summary: "A meaningful next chapter",
  total_experience_years: 20,
  work_authorisation: "Singapore citizen",
  strengths: ["Transformation leadership"],
  exclusions: [],
};

const readyInput: ProductJourneyInput = {
  profile,
  completeImports: 1,
  roles: 5,
  evidence: 20,
  approvedEvidence: 20,
  pendingEvidence: 0,
  activeLanes: 2,
  activeLaneAllocation: 100,
  searchPreferences: {
    targetLocations: ["Singapore"],
    remotePreference: "Flexible",
    sources: [{ id: "official", name: "Employer", url: "https://example.com/jobs", type: "Official", coverage: "Global", trust: "Primary", active: true }],
  },
};

function job(overrides: Partial<CommandCentreJob> = {}): CommandCentreJob {
  return {
    id: "job-1",
    title: "Senior Engagement Manager",
    employer: "Example Corp",
    status: "analysed",
    recommendation: "apply",
    overall_match: 86,
    rule_analysis: null,
    deep_analysis_status: "not_started",
    deep_analysis_summary: null,
    updated_at: "2026-08-10T00:00:00.000Z",
    ...overrides,
  };
}

function application(overrides: Partial<CommandCentreApplication> = {}): CommandCentreApplication {
  return {
    job_id: "job-1",
    resume_draft: null,
    next_action: null,
    next_action_date: null,
    ...overrides,
  };
}

function build(jobs: CommandCentreJob[] = [], applications: CommandCentreApplication[] = []) {
  return buildCareerCommandCentre({
    journey: buildProductJourney(readyInput),
    jobs,
    applications,
    approvedEvidence: 20,
    pendingEvidence: 0,
  });
}

describe("career command centre", () => {
  it("shows one five-stage journey and sends a ready user to opportunities", () => {
    const result = build();

    expect(result.stages.map((stage) => stage.label)).toEqual([
      "Career Profile",
      "Search Strategy",
      "Opportunities",
      "Applications",
      "Outcomes",
    ]);
    expect(result.stages.find((stage) => stage.id === "opportunities")?.state).toBe("current");
    expect(result.nextAction.href).toBe("/jobs#analyse");
    expect(result.aiBrief).toBeNull();
  });

  it("keeps foundation work ahead of recurring opportunity work", () => {
    const journey = buildProductJourney({ ...readyInput, approvedEvidence: 0, pendingEvidence: 20 });
    const result = buildCareerCommandCentre({
      journey,
      jobs: [job()],
      applications: [],
      approvedEvidence: 0,
      pendingEvidence: 20,
    });

    expect(result.nextAction.href).toContain("profile-review");
    expect(result.stages[0].state).toBe("current");
    expect(result.reviewItems[0].label).toContain("20 career facts");
  });

  it("uses the strongest open opportunity to choose the next AI action", () => {
    const result = build([
      job({ id: "review", title: "IT Manager", recommendation: "review", overall_match: 65 }),
      job({ id: "strong", title: "Transformation Director", recommendation: "apply", overall_match: 91 }),
    ]);

    expect(result.nextAction.title).toContain("Transformation Director");
    expect(result.nextAction.label).toBe("Run Career Profile match");
    expect(result.aiBrief?.title).toBe("Transformation Director");
  });

  it("hands a deeply analysed role to truthful résumé preparation", () => {
    const result = build([job({ deep_analysis_status: "complete" })], [application()]);

    expect(result.nextAction.label).toBe("Create role-specific résumé");
    expect(result.nextAction.reason).toContain("does not yet have a tailored résumé");
  });

  it("prioritises interview preparation over discovery and résumé work", () => {
    const result = build([
      job({ id: "new-role", title: "Transformation Director", overall_match: 95 }),
      job({ id: "interview", title: "Service Delivery Lead", status: "interview", recommendation: "review", overall_match: 72, deep_analysis_status: "complete" }),
    ]);

    expect(result.nextAction.title).toBe("Prepare for Service Delivery Lead");
    expect(result.nextAction.href).toBe("/jobs/interview#interview-coach");
    expect(result.metrics.interviews).toBe(1);
    expect(result.reviewItems.some((item) => item.label.includes("interview-stage"))).toBe(true);
  });

  it("moves active applications to their recorded follow-up", () => {
    const result = build(
      [job({ status: "applied", deep_analysis_status: "complete" })],
      [application({ resume_draft: "Draft", next_action: "Follow up with recruiter" })],
    );

    expect(result.nextAction.title).toBe("Follow up with recruiter");
    expect(result.nextAction.href).toBe("/applications");
  });
});
