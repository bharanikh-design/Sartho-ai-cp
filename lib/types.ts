export type ApprovalStatus = "pending" | "approved" | "rejected";
export type Confidence = "low" | "medium" | "high";
export type JobRecommendation = "apply" | "review" | "skip";
export type JobStatus =
  | "saved"
  | "analysed"
  | "approved"
  | "applied"
  | "acknowledged"
  | "assessment"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn";

export type ProfileRecord = {
  id: string;
  full_name: string;
  location: string | null;
  headline: string | null;
  summary: string | null;
  total_experience_years: number | null;
  work_authorisation: string | null;
  strengths: string[];
  exclusions: string[];
};

export type TargetLaneRecord = {
  id: string;
  user_id: string;
  name: string;
  weight: number;
  priority: number;
  active: boolean;
};

export type CareerRoleRecord = {
  id: string;
  user_id: string;
  employer: string;
  title: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  summary: string | null;
};

export type EvidenceRecord = {
  id: string;
  user_id: string;
  external_key: string | null;
  career_role_id: string | null;
  claim: string;
  context: string | null;
  period_label: string | null;
  metrics: string[];
  domains: string[];
  source_name: string | null;
  source_locator: string | null;
  confidence: Confidence;
  approval_status: ApprovalStatus;
  safe_for_resume: boolean;
  created_at: string;
  updated_at: string;
  career_role?: CareerRoleRecord | null;
};

export type RuleAnalysis = {
  recommendation: JobRecommendation;
  confidence: string;
  primaryLane: string;
  technicalHeaviness: number;
  matchedSignals: string[];
  cautionSignals: string[];
  explanation: string;
};

export type JobRecord = {
  id: string;
  user_id: string;
  source: string | null;
  source_url: string | null;
  employer: string | null;
  title: string;
  location: string | null;
  raw_description: string;
  status: JobStatus;
  technical_heaviness: number | null;
  overall_match: number | null;
  recommendation: JobRecommendation | null;
  rule_analysis: RuleAnalysis | null;
  deep_analysis_status: "not_started" | "processing" | "complete" | "failed";
  deep_analysis_summary: DeepAnalysisSummary | null;
  deep_analysed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RequirementAssessment = "met" | "partially_met" | "not_met" | "unknown";
export type RequirementType = "mandatory" | "preferred" | "contextual";

export type JobRequirementRecord = {
  id: string;
  job_id: string;
  requirement_text: string;
  requirement_type: RequirementType;
  category: string | null;
  matched_evidence_ids: string[];
  assessment: RequirementAssessment;
  confidence: Confidence;
  rationale: string | null;
  created_at: string;
};

export type DeepAnalysisSummary = {
  mandatoryMet: number;
  mandatoryTotal: number;
  preferredMet: number;
  preferredTotal: number;
  strongestMatches: string[];
  honestGaps: string[];
  recruiterSignals: string[];
};

export type ResumeChange = {
  type: "emphasised" | "reworded" | "omitted" | "moved";
  description: string;
  evidenceIds: string[];
};

export type ApplicationRecord = {
  id: string;
  user_id: string;
  job_id: string;
  status: JobStatus;
  resume_version: string | null;
  resume_draft: string | null;
  resume_change_log: ResumeChange[];
  resume_evidence_ids: string[];
  resume_generated_at: string | null;
  cover_note: string | null;
  submitted_at: string | null;
  confirmation_reference: string | null;
  next_action: string | null;
  next_action_date: string | null;
  created_at: string;
  updated_at: string;
};
