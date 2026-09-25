import type { CareerRoleRecord, EvidenceRecord, ProfileRecord, TargetLaneRecord } from "@/lib/types";
import type { SearchPreferences } from "@/lib/data/search";
import { buildSkillProfile } from "@/lib/matching/skill-profile";
import type { LearnedAffinitySignal } from "@/lib/context/interaction-memory";

export const CANDIDATE_CONTEXT_SCHEMA_VERSION = 1;

export type ContextAuthority = "career_truth" | "explicit_intent" | "learned_affinity";
export type ContextSource =
  | "master_resume"
  | "approved_evidence"
  | "career_direction"
  | "search_brief"
  | "interaction"
  | "market_outcome";

export type ContextSignal<T> = {
  value: T;
  authority: ContextAuthority;
  source: ContextSource;
  confidence: number;
  evidenceRefs: string[];
};

export type CandidateContext = {
  schemaVersion: number;
  generatedAt: string;
  careerTruth: {
    headline: ContextSignal<string> | null;
    summary: ContextSignal<string> | null;
    yearsExperience: ContextSignal<number> | null;
    workAuthorisation: ContextSignal<string> | null;
    heldRoles: Array<ContextSignal<{ title: string; employer: string; current: boolean }>>;
    capabilities: Array<ContextSignal<{ name: string; strength: string; evidenceCount: number; current: boolean }>>;
    explicitExclusions: Array<ContextSignal<string>>;
  };
  explicitIntent: {
    targetRoles: Array<ContextSignal<{ name: string; weight: number; priority: number }>>;
    countries: Array<ContextSignal<string>>;
    locations: Array<ContextSignal<string>>;
    companies: Array<ContextSignal<string>>;
    employmentTypes: Array<ContextSignal<string>>;
    remotePreferences: Array<ContextSignal<string>>;
    experienceLevel: ContextSignal<string> | null;
    directEmployersOnly: ContextSignal<boolean> | null;
  };
  learnedAffinity: {
    signals: Array<ContextSignal<{ concept: string; polarity: "positive" | "negative"; reason: string }>>;
  };
};

function textSignal(
  value: string | null | undefined,
  source: ContextSource,
  refs: string[] = [],
): ContextSignal<string> | null {
  const trimmed = value?.trim();
  return trimmed ? {
    value: trimmed,
    authority: "career_truth",
    source,
    confidence: 1,
    evidenceRefs: refs,
  } : null;
}

function intentSignal<T>(value: T, source: ContextSource, refs: string[] = []): ContextSignal<T> {
  return {
    value,
    authority: "explicit_intent",
    source,
    confidence: 1,
    evidenceRefs: refs,
  };
}

/**
 * Canonical candidate context, assembled only from sources the user deliberately
 * supplied or approved. Learned behaviour is intentionally empty in V1: later
 * PRs may append inferred affinity, but they may never overwrite career truth
 * or explicit intent.
 */
export function buildCandidateContext(input: {
  profile: ProfileRecord | null;
  roles: CareerRoleRecord[];
  evidence: EvidenceRecord[];
  lanes: TargetLaneRecord[];
  search: SearchPreferences;
  learnedAffinity?: LearnedAffinitySignal[];
  generatedAt?: string;
}): CandidateContext {
  const { profile, roles, evidence, lanes, search } = input;
  const approved = evidence.filter((item) => item.approval_status === "approved");
  const skills = buildSkillProfile(approved, roles).skills;

  const countries = search.countries.length
    ? search.countries
    : search.country
      ? [search.country]
      : [];

  return {
    schemaVersion: CANDIDATE_CONTEXT_SCHEMA_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    careerTruth: {
      headline: textSignal(profile?.headline, "master_resume", profile ? [profile.id] : []),
      summary: textSignal(profile?.summary, "master_resume", profile ? [profile.id] : []),
      yearsExperience: profile?.total_experience_years == null ? null : {
        value: profile.total_experience_years,
        authority: "career_truth",
        source: "master_resume",
        confidence: 1,
        evidenceRefs: profile ? [profile.id] : [],
      },
      workAuthorisation: textSignal(profile?.work_authorisation, "master_resume", profile ? [profile.id] : []),
      heldRoles: roles.map((role) => ({
        value: { title: role.title, employer: role.employer, current: role.is_current },
        authority: "career_truth" as const,
        source: "master_resume" as const,
        confidence: 1,
        evidenceRefs: [role.id],
      })),
      capabilities: skills.map((skill) => ({
        value: {
          name: skill.capability,
          strength: skill.strength,
          evidenceCount: skill.evidenceCount,
          current: skill.current,
        },
        authority: "career_truth" as const,
        source: "approved_evidence" as const,
        confidence: skill.strength === "core" ? 1 : skill.strength === "strong" ? 0.9 : skill.strength === "supporting" ? 0.75 : 0.55,
        evidenceRefs: skill.evidenceIds,
      })),
      explicitExclusions: (profile?.exclusions ?? []).map((value) => ({
        value,
        authority: "career_truth" as const,
        source: "master_resume" as const,
        confidence: 1,
        evidenceRefs: profile ? [profile.id] : [],
      })),
    },
    explicitIntent: {
      targetRoles: lanes
        .filter((lane) => lane.active)
        .sort((a, b) => a.priority - b.priority)
        .map((lane) => intentSignal(
          { name: lane.name, weight: lane.weight, priority: lane.priority },
          "career_direction",
          [lane.id],
        )),
      countries: countries.map((value) => intentSignal(value, "search_brief")),
      locations: search.targetLocations.map((value) => intentSignal(value, "search_brief")),
      companies: search.targetCompanies.map((value) => intentSignal(value, "search_brief")),
      employmentTypes: search.employmentTypes.map((value) => intentSignal(value, "search_brief")),
      remotePreferences: search.remotePreferences.map((value) => intentSignal(value, "search_brief")),
      experienceLevel: search.experienceLevel ? intentSignal(search.experienceLevel, "search_brief") : null,
      directEmployersOnly: search.directEmployersOnly === undefined
        ? null
        : intentSignal(search.directEmployersOnly, "search_brief"),
    },
    learnedAffinity: {
      signals: (input.learnedAffinity ?? []).map((signal) => ({
        value: {
          concept: signal.concept,
          polarity: signal.polarity,
          reason: signal.reason,
        },
        authority: "learned_affinity" as const,
        source: signal.source,
        confidence: signal.confidence,
        evidenceRefs: signal.eventIds,
      })),
    },
  };
}
