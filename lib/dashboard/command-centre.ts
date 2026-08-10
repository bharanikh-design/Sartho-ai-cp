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
  id: "profile" | "strategy" | "opportunities" | "applications" | "outcomes";
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
  const profileSteps = journey.steps.filter((step) => step.id !== "search");
  const profileComplete = profileSteps.every((step) => step.complete);
  const searchStep = journey.steps.find((step) => step.id === "search");
  const strategyComplete = searchStep?.complete ?? false;

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
      description: "Add one complete job description. Sartho will compare it with your confirmed Career Profile before recommending what to do.",
      reason: "Your career foundation and search strategy are ready; a real opportunity is the next input the workflow needs.",
      href: "/jobs#analyse",
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
      description: "Your saved opportunities have outcomes. Add another role and let Sartho compare it with your confirmed Career Profile.",
      reason: `${plural(outcomes.length, "outcome")} recorded; there is no open opportunity waiting for action.`,
      href: "/jobs#analyse",
      label: "Analyse another role",
    };
  }

  const currentStage = !profileComplete
    ? "profile"
    : !strategyComplete
      ? "strategy"
      : !jobs.length
        ? "opportunities"
        : !activeApplications.length && !outcomes.length
          ? "applications"
          : "outcomes";

  const stages: CommandCentreStage[] = [
    {
      id: "profile",
      label: "Career Profile",
      value: profileComplete ? "Ready" : `${profileSteps.filter((step) => step.complete).length}/${profileSteps.length}`,
      detail: profileComplete ? `${plural(approvedEvidence, "approved career fact")}` : `Next: ${journey.current.label}`,
      href: profileComplete ? "/career-truth" : journey.current.href,
      state: profileComplete ? "complete" : "current",
    },
    {
      id: "strategy",
      label: "Search Strategy",
      value: strategyComplete ? "Ready" : "Not set",
      detail: strategyComplete ? "Priorities, locations and sources confirmed" : "Define what a worthwhile role looks like",
      href: "/search-plan",
      state: strategyComplete ? "complete" : currentStage === "strategy" ? "current" : "pending",
    },
    {
      id: "opportunities",
      label: "Opportunities",
      value: String(jobs.length),
      detail: jobs.length ? `${plural(strongMatches.length, "strong match", "strong matches")}` : "Add the first real role",
      href: "/jobs",
      state: jobs.length ? "active" : currentStage === "opportunities" ? "current" : "pending",
    },
    {
      id: "applications",
      label: "Applications",
      value: String(activeApplications.length),
      detail: interviews.length ? `${plural(interviews.length, "role")} needs preparation` : "Applied through interview",
      href: "/applications",
      state: activeApplications.length ? "active" : currentStage === "applications" ? "current" : "pending",
    },
    {
      id: "outcomes",
      label: "Outcomes",
      value: String(outcomes.length),
      detail: outcomes.length ? "Offers, rejections or withdrawals recorded" : "Waiting for a real outcome",
      href: "/applications",
      state: outcomes.length ? "complete" : currentStage === "outcomes" ? "current" : "pending",
    },
  ];

  const reviewItems: CommandCentreReviewItem[] = [];
  if (pendingEvidence) {
    reviewItems.push({
      label: `${plural(pendingEvidence, "career fact")} need your confirmation`,
      detail: "AI suggestions cannot use these facts until you approve them.",
      href: "/career-truth#profile-review",
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
      href: "/jobs",
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
