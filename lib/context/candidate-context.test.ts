import { describe, expect, it } from "vitest";
import type { CareerRoleRecord, EvidenceRecord, ProfileRecord, TargetLaneRecord } from "@/lib/types";
import type { SearchPreferences } from "@/lib/data/search";
import { buildCandidateContext } from "./candidate-context";
import { sourceFingerprint } from "@/lib/data/candidate-context";

const profile: ProfileRecord = {
  id: "u",
  full_name: "Candidate",
  location: "Singapore",
  country: "sg",
  headline: "Senior Engagement Manager",
  summary: "Enterprise technology delivery leader.",
  total_experience_years: 18,
  work_authorisation: "Singapore",
  strengths: ["Stakeholder leadership"],
  exclusions: ["Pure software development"],
};

const roles: CareerRoleRecord[] = [{
  id: "r1",
  user_id: "u",
  employer: "Example",
  title: "ServiceNow Engagement Manager",
  location: "Singapore",
  start_date: "2023-01-01",
  end_date: null,
  is_current: true,
  summary: null,
}];

const evidence: EvidenceRecord[] = [
  {
    id: "e1",
    user_id: "u",
    external_key: null,
    career_role_id: "r1",
    claim: "Led ServiceNow ITSM stakeholder workshops and programme delivery.",
    context: null,
    period_label: null,
    metrics: [],
    domains: ["ServiceNow", "ITSM"],
    source_name: "Master resume",
    source_locator: null,
    confidence: "high",
    approval_status: "approved",
    safe_for_resume: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    career_role: roles[0],
  },
  {
    id: "e2",
    user_id: "u",
    external_key: null,
    career_role_id: "r1",
    claim: "Unapproved SAP claim that must not enter career truth.",
    context: null,
    period_label: null,
    metrics: [],
    domains: ["SAP"],
    source_name: "Draft",
    source_locator: null,
    confidence: "high",
    approval_status: "pending",
    safe_for_resume: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    career_role: roles[0],
  },
];

const lanes: TargetLaneRecord[] = [{
  id: "l1",
  user_id: "u",
  name: "Transformation Director",
  weight: 80,
  priority: 1,
  active: true,
}];

const search: SearchPreferences = {
  country: "sg",
  countries: ["sg", "au"],
  employmentTypes: ["Full-time"],
  targetLocations: ["Singapore"],
  targetCompanies: ["Accenture"],
  experienceLevel: null,
  remotePreferences: ["Hybrid"],
  sources: [],
  directEmployersOnly: true,
};

describe("buildCandidateContext", () => {
  it("keeps career truth, explicit intent and future learned affinity as separate authorities", () => {
    const context = buildCandidateContext({
      profile,
      roles,
      evidence,
      lanes,
      search,
      generatedAt: "2026-09-25T10:40:00Z",
    });

    expect(context.careerTruth.heldRoles[0].authority).toBe("career_truth");
    expect(context.careerTruth.capabilities.every((signal) => signal.authority === "career_truth")).toBe(true);
    expect(context.explicitIntent.targetRoles[0].authority).toBe("explicit_intent");
    expect(context.explicitIntent.targetRoles[0].source).toBe("career_direction");
    expect(context.explicitIntent.countries.map((signal) => signal.value)).toEqual(["sg", "au"]);
    expect(context.learnedAffinity.signals).toEqual([]);
  });

  it("uses only approved evidence to establish capabilities", () => {
    const context = buildCandidateContext({
      profile,
      roles,
      evidence,
      lanes,
      search,
      generatedAt: "2026-09-25T10:40:00Z",
    });

    const evidenceRefs = context.careerTruth.capabilities.flatMap((signal) => signal.evidenceRefs);
    expect(evidenceRefs).toContain("e1");
    expect(evidenceRefs).not.toContain("e2");
  });

  it("keeps provenance receipts beside every explicit target role", () => {
    const context = buildCandidateContext({
      profile,
      roles,
      evidence,
      lanes,
      search,
      generatedAt: "2026-09-25T10:40:00Z",
    });

    expect(context.explicitIntent.targetRoles[0].evidenceRefs).toEqual(["l1"]);
    expect(context.careerTruth.heldRoles[0].evidenceRefs).toEqual(["r1"]);
  });

  it("produces the same source fingerprint when only generation time changes", () => {
    const first = buildCandidateContext({
      profile,
      roles,
      evidence,
      lanes,
      search,
      generatedAt: "2026-09-25T10:40:00Z",
    });
    const second = buildCandidateContext({
      profile,
      roles,
      evidence,
      lanes,
      search,
      generatedAt: "2026-09-25T11:40:00Z",
    });

    expect(sourceFingerprint(first)).toBe(sourceFingerprint(second));
  });

  it("changes the source fingerprint when explicit intent changes", () => {
    const first = buildCandidateContext({
      profile,
      roles,
      evidence,
      lanes,
      search,
      generatedAt: "2026-09-25T10:40:00Z",
    });
    const second = buildCandidateContext({
      profile,
      roles,
      evidence,
      lanes: [{ ...lanes[0], name: "ServiceNow Delivery Director" }],
      search,
      generatedAt: "2026-09-25T10:40:00Z",
    });

    expect(sourceFingerprint(first)).not.toBe(sourceFingerprint(second));
  });
});
