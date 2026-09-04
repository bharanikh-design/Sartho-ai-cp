import type { ProductJourneyState } from "@/lib/journey/product-journey";
import type { DeepAnalysisSummary, JobRecommendation, JobStatus, RuleAnalysis } from "@/lib/types";

export type CommandCentreJob = {
  id: string;
  title: string;
  employer: string | null;
  status: JobStatus;
  recommendation: JobRecommendation | null;
  overall_match: number | null;
  rule_analysis: RuleAnalysis | null;
  deep_analysis_status: "not_started" | "processing" | "complete" | "failed";
  deep_analysis_summary: DeepAnalysisSummary | null;
  updated_at: string;
};

export type CommandCentreApplication = {
  job_id: string;
  resume_draft: string | null;
  next_action: string | null;
  next_action_date: string | null;
};

export type CommandCentreStage = {
  id: "resume" | "direction" | "search" | "applications" | "studio";
  label: string;
  value: string;
  detail: string;
  href: string;
  state: "complete" | "current" | "active" | "pending";
};

export type CommandCentreAction = {
  eyebrow: string;
  title: string;
  description: string;
  reason: string;
  href: string;
  label: string;
};

export type CommandCentreReviewItem = {
  label: string;
  detail: string;
  href: string;
  tone: "attention" | "ready" | "information";
};

const activeApplicationStatuses = new Set<JobStatus>(["applied", "acknowledged", "assessment", "interview"]);
const interviewStatuses = new Set<JobStatus>(["assessment", "interview"]);
const outcomeStatuses = new Set<JobStatus>(["offer", "rejected", "withdrawn"]);

function opportunityScore(job: CommandCentreJob) {
  const statusBoost = interviewStatuses.has(job.status) ? 500 : activeApplicationStatuses.has(job.status) ? 300 : 0;
  const recommendationBoost = job.recommendation === "apply" ? 200 : job.recommendation === "review" ? 100 : 0;
  const analysisBoost = job.deep_analysis_status === "complete" ? 40 : 0;
  return statusBoost + recommendationBoost + analysisBoost + (job.overall_match ?? 0);
}

function choosePriorityOpportunity(jobs: CommandCentreJob[]) {
  return jobs
    .filter((job) => !outcomeStatuses.has(job.status))
    .sort((left, right) => {
      const scoreDifference = opportunityScore(right) - opportunityScore(left);
      if (scoreDifference) return scoreDifference;
      return new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime();
    })[0] ?? null;
}

function plural(value: number, singular: string, pluralForm = `${singular}s`) {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

export function buildCareerCommandCentre({
  journey,
  jobs,
  applications,
  approvedEvidence,
  pendingEvidence,
}: {
  journey: ProductJourneyState;
  jobs: CommandCentreJob[];
  applications: CommandCentreApplication[];
  approvedEvidence: number;
  pendingEvidence: number;
}) {
  const applicationByJob = new Map(applications.map((application) => [application.job_id, application]));
  const activeApplications = jobs.filter((job) => activeApplicationStatuses.has(job.status));
  const interviews = jobs.filter((job) => interviewStatuses.has(job.status));
  const outcomes = jobs.filter((job) => outcomeStatuses.has(job.status));
  const strongMatches = jobs.filter((job) => job.recommendation === "apply");
  const priorityOpportunity = choosePriorityOpportunity(jobs);
  const priorityApplication = priorityOpportunity ? applicationByJob.get(priorityOpportunity.id) : null;

  let nextAction: CommandCentreAction;
  if (!journey.activated) {
    nextAction = {
      eyebrow: `Foundation · Step ${journey.currentIndex + 1} of ${journey.steps.length}`,
      title: journey.current.title,
      description: journey.current.description,
      reason: journey.current.reason,
      href: journey.current.href,
      label: "Continue this step",
    };
  } else if (interviews.length) {
    const interview = choosePriorityOpportunity(interviews) ?? interviews[0];
    nextAction = {
      eyebrow: "AI priority · Interview action",
      title: `Prepare for ${interview.title}`,
      description: `Use the role requirements and your approved career evidence to build truthful answers for ${interview.employer ?? "this employer"}.`,
      reason: `This opportunity is currently marked ${interview.status}; interview-stage work takes priority over new role discovery.`,
      href: `/jobs/${interview.id}#interview-coach`,
      label: "Open AI interview coach",
    };
  } else if (!jobs.length) {
    nextAction = {
      eyebrow: "Next best action",
      title: "Analyse your first promising role",
      description: "Add one complete job description. Sartho will compare it with your approved career evidence before recommending what to do.",
      reason: "Your career foundation and search strategy are ready; a real opportunity is the next input the workflow needs.",
      href: "/applications#add-role",
      label: "Add and analyse a role",
    };
  } else if (priorityOpportunity && priorityOpportunity.deep_analysis_status !== "complete" && priorityOpportunity.recommendation !== "skip") {
    nextAction = {
      eyebrow: priorityOpportunity.recommendation === "apply" ? "AI priority · Strong preliminary match" : "AI priority · Validate the fit",
      title: `Map ${priorityOpportunity.title} to your Career Profile`,
      description: "Run the evidence-grounded analysis to see which requirements you meet, where the honest gaps are and what a recruiter may test.",
      reason: `${priorityOpportunity.title} is the highest-priority open opportunity based on its saved match signal and current workflow stage.`,
      href: `/jobs/${priorityOpportunity.id}`,
      label: "Run Career Profile match",
    };
  } else if (priorityOpportunity && priorityOpportunity.deep_analysis_status === "complete" && !priorityApplication?.resume_draft && priorityOpportunity.status !== "applied" && priorityOpportunity.status !== "acknowledged") {
    nextAction = {
      eyebrow: "AI priority · Ready to prepare",
      title: `Create the résumé for ${priorityOpportunity.title}`,
      description: "The requirements are mapped. Create a role-specific draft using only the career evidence you approved, with every change shown for review.",
      reason: "This role has completed deep analysis but does not yet have a tailored résumé draft.",
      href: `/jobs/${priorityOpportunity.id}`,
      label: "Create role-specific résumé",
    };
  } else if (activeApplications.length) {
    const followUp = applications.find((application) => application.next_action?.trim());
    nextAction = {
      eyebrow: "Next best action · Application follow-up",
      title: followUp?.next_action?.trim() || `Review ${plural(activeApplications.length, "active application")}`,
      description: "Keep the real-world status, next follow-up and employer outcome current so the dashboard can prioritise accurately.",
      reason: `${plural(activeApplications.length, "application")} ${activeApplications.length === 1 ? "is" : "are"} currently active and no interview action is due.`,
      href: "/applications",
      label: "Open application tracker",
    };
  } else if (priorityOpportunity) {
    nextAction = {
      eyebrow: "Next best action · Decision",
      title: `Decide whether to progress ${priorityOpportunity.title}`,
      description: "Review the fit, gaps and preparation outputs, then record the real decision so the opportunity moves forward or closes cleanly.",
      reason: "This is the strongest open saved opportunity that has not yet entered the application pipeline.",
      href: `/jobs/${priorityOpportunity.id}`,
      label: "Review opportunity decision",
    };
  } else {
    nextAction = {
      eyebrow: "Next best action",
      title: "Find the next worthwhile opportunity",
      description: "Your saved opportunities have outcomes. Add another role and let Sartho compare it with your approved career evidence.",
      reason: `${plural(outcomes.length, "outcome")} recorded; there is no open opportunity waiting for action.`,
      href: "/applications#add-role",
      label: "Analyse another role",
    };
  }

  const resumeStep = journey.steps.find((step) => step.id === "resume");
  const directionStep = journey.steps.find((step) => step.id === "direction");
  const searchStep = journey.steps.find((step) => step.id === "search");
  const hasDraft = applications.some((application) => Boolean(application.resume_draft?.trim()));

  const stages: CommandCentreStage[] = [
    {
      id: "resume",
      label: "Upload résumé",
      value: resumeStep?.complete ? "Ready" : "To do",
      detail: resumeStep?.complete ? plural(approvedEvidence, "approved career fact") : "Add your source résumé",
      href: "/career-truth",
      state: resumeStep?.complete ? "complete" : "current",
    },
    {
      id: "direction",
      label: "Career direction",
      value: directionStep?.complete ? "Ready" : "Not set",
      detail: directionStep?.complete ? "Target roles and priorities set" : "Choose the roles Sartho should prioritise",
      href: "/career-direction",
      state: directionStep?.complete ? "complete" : resumeStep?.complete ? "current" : "pending",
    },
    {
      id: "search",
      label: "Search brief",
      value: searchStep?.complete ? "Ready" : "Not set",
      detail: searchStep?.complete ? "Locations, work model and sources set" : "Define what a worthwhile role looks like",
      href: "/search-plan",
      state: searchStep?.complete ? "complete" : directionStep?.complete ? "current" : "pending",
    },
    {
      id: "applications",
      label: "Applications",
      value: String(jobs.length),
      detail: jobs.length ? plural(activeApplications.length, "active application") : "Add and analyse your first role",
      href: "/applications",
      state: jobs.length ? "active" : journey.activated ? "current" : "pending",
    },
    {
      id: "studio",
      label: "Résumé Studio",
      value: hasDraft ? "Active" : "—",
      detail: hasDraft ? "Tailored drafts in progress" : "Tailor a résumé to a saved role",
      href: "/resume-studio",
      state: hasDraft ? "active" : "pending",
    },
  ];

  const reviewItems: CommandCentreReviewItem[] = [];
  if (pendingEvidence) {
    reviewItems.push({
      label: `${plural(pendingEvidence, "career fact")} to reconcile`,
      detail: "A newer résumé added details that have not been merged yet.",
      href: "/career-truth",
      tone: "attention",
    });
  }
  if (interviews.length) {
    reviewItems.push({
      label: `${plural(interviews.length, "interview-stage role")} need preparation`,
      detail: "Generate grounded questions and choose the approved stories you will use.",
      href: "/interview-prep",
      tone: "attention",
    });
  }
  if (strongMatches.length) {
    reviewItems.push({
      label: `${plural(strongMatches.length, "strong match", "strong matches")} ready for a decision`,
      detail: "Review the evidence and gaps before progressing any application.",
      href: "/applications",
      tone: "ready",
    });
  }
  if (!reviewItems.length) {
    reviewItems.push({
      label: "Nothing is waiting for approval",
      detail: "Sartho will surface the next decision here as your workflow changes.",
      href: nextAction.href,
      tone: "information",
    });
  }

  const aiBrief = priorityOpportunity
    ? {
        eyebrow: "AI career briefing",
        title: priorityOpportunity.title,
        employer: priorityOpportunity.employer ?? "Employer not recorded",
        summary: priorityOpportunity.rule_analysis?.explanation
          ?? "This is the highest-priority open role based on the information currently saved in your workspace.",
        match: priorityOpportunity.overall_match,
        recommendation: priorityOpportunity.recommendation,
        analysisComplete: priorityOpportunity.deep_analysis_status === "complete",
        href: `/jobs/${priorityOpportunity.id}`,
      }
    : null;

  return {
    stages,
    nextAction,
    reviewItems: reviewItems.slice(0, 3),
    aiBrief,
    metrics: {
      activeApplications: activeApplications.length,
      interviews: interviews.length,
      outcomes: outcomes.length,
      strongMatches: strongMatches.length,
    },
  };
}
