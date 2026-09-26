/*
 * The fixture account the signed-in specs drive.
 *
 * Column names mirror supabase/migrations, so a seed row that stops matching
 * the schema is a real signal rather than a harness quirk.
 */
export const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";

export const TEST_USER = {
  id: TEST_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "e2e@sartho.test",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  phone: "",
  confirmed_at: "2026-01-01T00:00:00.000Z",
  last_sign_in_at: "2026-09-26T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { full_name: "Evie Endtoend" },
  identities: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-09-26T00:00:00.000Z",
  is_anonymous: false,
};

const now = "2026-09-26T09:00:00.000Z";

function evidence(id, claim, domains, approval_status = "approved") {
  return {
    id,
    user_id: TEST_USER_ID,
    external_key: null,
    career_role_id: "role-1",
    claim,
    context: "Delivered with a platform team of nine.",
    period_label: "2023–2025",
    metrics: ["37% faster releases"],
    domains,
    source_name: "resume.pdf",
    source_locator: "page 1",
    confidence: "high",
    approval_status,
    safe_for_resume: true,
    created_at: now,
    updated_at: now,
  };
}

/*
 * A stored ScoredJobMatch. `relevanceTier` is what decides visibility in
 * JobSearchPanel, so it is set explicitly rather than left to the legacy
 * `recommendation` fallback.
 */
function match(overrides) {
  return {
    employer: null,
    location: null,
    salary: null,
    postedAt: now,
    source: "seeded-fixture",
    description: "",
    overallMatch: 80,
    recommendation: "apply",
    relevanceTier: "strong",
    matchedSkills: [],
    titleFit: 0.9,
    requirementCoverage: 0.8,
    closestTitle: "Principal Engineer",
    closestIsHeld: true,
    requirementsRead: 8,
    missingRequirements: [],
    requiredYears: null,
    requiredEvidence: null,
    platforms: [],
    applyDirect: false,
    ...overrides,
  };
}

export const SEED = {
  profiles: [{
    id: TEST_USER_ID,
    full_name: "Evie Endtoend",
    location: "Melbourne, Australia",
    country: "au",
    headline: "Principal Platform Engineer",
    summary: "Fifteen years building developer platforms for regulated industries.",
    total_experience_years: 15,
    work_authorisation: "Australian citizen",
    strengths: ["Platform engineering", "Developer experience"],
    exclusions: ["On-call rotations"],
  }],

  target_lanes: [
    { id: "lane-1", user_id: TEST_USER_ID, name: "Principal Platform Engineer", weight: 0.6, priority: 1, active: true },
    { id: "lane-2", user_id: TEST_USER_ID, name: "Head of Developer Experience", weight: 0.4, priority: 2, active: true },
  ],

  career_roles: [{
    id: "role-1",
    user_id: TEST_USER_ID,
    employer: "Northwind Bank",
    title: "Principal Engineer",
    location: "Melbourne",
    start_date: "2023-02-01",
    end_date: null,
    is_current: true,
    summary: "Owned the internal developer platform.",
  }],

  evidence_items: [
    evidence("ev-1", "Cut deployment lead time from four days to six hours.", ["Platform engineering", "CI/CD"]),
    evidence("ev-2", "Rolled a golden-path service template out to 40 teams.", ["Developer experience"]),
    evidence("ev-3", "Drafted the FY27 reliability roadmap.", ["Reliability"], "pending"),
  ],

  resume_imports: [{
    id: "import-1",
    user_id: TEST_USER_ID,
    file_name: "evie-endtoend.pdf",
    label: "Master résumé",
    status: "complete",
    error: null,
    roles_created: 1,
    evidence_created: 3,
    evidence_skipped: 0,
    character_count: 8421,
    byte_size: 120_233,
    created_at: now,
    completed_at: now,
    object_path: "resumes/evie.pdf",
    is_master: true,
    archived_at: null,
  }],

  search_preferences: [{
    id: "prefs-1",
    user_id: TEST_USER_ID,
    country: "au",
    countries: ["au"],
    employment_types: ["Full-time"],
    target_locations: ["Melbourne"],
    target_companies: ["Atlassian"],
    experience_level: "senior",
    remote_preference: "Hybrid",
    sources: [],
    direct_employers_only: false,
  }],

  /*
   * Career Direction reads the stored suggestion set rather than spending AI
   * allowance on a page view, so seeding it exercises the rendered path.
   */
  direction_suggestion_sets: [{
    id: "suggestions-1",
    user_id: TEST_USER_ID,
    steering: "Lean towards platform leadership.",
    /* Dismissal is matched on `name`, so the seed must use the same key. */
    dismissed: ["Site Reliability Engineer"],
    suggestions: [
      {
        name: "Director of Platform Engineering",
        path: "direct",
        rationale: "Your golden-path rollout is the scope this title buys.",
        evidenceIds: ["ev-1", "ev-2"],
        supportingSignals: ["Cut deployment lead time to six hours", "Golden-path template across 40 teams"],
      },
      {
        name: "Staff Developer Advocate",
        path: "adjacent",
        rationale: "Forty teams onboarded is a developer-experience mandate.",
        evidenceIds: ["ev-2"],
        supportingSignals: ["Golden-path template across 40 teams"],
      },
      /* Filtered out of the rail by `dismissed` — proof the filter runs. */
      {
        name: "Site Reliability Engineer",
        path: "adjacent",
        rationale: "Should never reach the rail: it is in `dismissed`.",
        evidenceIds: ["ev-1"],
        supportingSignals: ["Reliability roadmap"],
      },
    ],
  }],

  /* The last search, so Find Roles renders matches without a provider key. */
  search_results: [{
    id: "search-1",
    user_id: TEST_USER_ID,
    searched_at: now,
    criteria: { countries: ["au"], roles: ["Principal Platform Engineer"], locations: ["Melbourne"] },
    results: [match({
      title: "Principal Platform Engineer",
      url: "https://example.test/jobs/principal-platform-engineer",
      employer: "Atlassian",
      location: "Melbourne, AU",
      salary: "A$230,000",
      description: "Own the internal developer platform for 40 product teams.",
      overallMatch: 88,
      matchedSkills: ["Platform engineering", "Developer experience"],
      requiredYears: 12,
      applyDirect: true,
      platforms: ["Atlassian careers"],
    }), match({
      title: "Head of Developer Experience",
      url: "https://example.test/jobs/head-of-devex",
      employer: "Canva",
      location: "Remote, AU",
      description: "Lead the developer experience group.",
      overallMatch: 74,
      matchedSkills: ["Developer experience"],
      missingRequirements: ["Direct people leadership at scale"],
    })],
  }],

  jobs: [],
  applications: [],
  job_requirements: [],
  notification_preferences: [],
  integration_connections: [],
  user_activity: [],
  candidate_interactions: [],
  candidate_context_snapshots: [],
  durable_ai_operations: [],
  seen_job_matches: [],
  job_search_cache: [],
  anonymous_visitors: [],
  system_errors: [],
  resume_versions: [],
};
