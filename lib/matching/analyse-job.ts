export type RoleLane =
  | "EUC, Digital Workplace & ITSM Transformation Leadership"
  | "ServiceNow Engagement, Delivery & Transformation Management"
  | "Senior ServiceNow Business Process, Functional & Advisory"
  | "Outside current focus";

export type JobRecommendation = "apply" | "review" | "skip";

export type JobAnalysis = {
  recommendation: JobRecommendation;
  primaryLane: RoleLane;
  confidence: "low" | "medium" | "high";
  technicalHeaviness: number;
  matchedSignals: string[];
  cautionSignals: string[];
  explanation: string;
};

type SignalGroup = {
  lane: Exclude<RoleLane, "Outside current focus">;
  signals: string[];
};

const laneSignals: SignalGroup[] = [
  {
    lane: "EUC, Digital Workplace & ITSM Transformation Leadership",
    signals: [
      "end user computing", "euc", "digital workplace", "modern workplace", "service desk",
      "endpoint", "intune", "sccm", "microsoft 365", "m365", "avd", "desktop transformation",
      "employee experience", "digital employee experience", "dex", "xla", "itsm",
      "incident management", "problem management", "change management", "request management",
      "knowledge management",
    ],
  },
  {
    lane: "ServiceNow Engagement, Delivery & Transformation Management",
    signals: [
      "engagement manager", "delivery manager", "programme manager", "program manager",
      "transformation manager", "professional services", "client delivery", "delivery governance",
      "executive stakeholder", "stakeholder management", "vendor management", "budget management",
      "commercial management", "portfolio management", "service transformation",
      "servicenow programme", "servicenow program",
    ],
  },
  {
    lane: "Senior ServiceNow Business Process, Functional & Advisory",
    signals: [
      "business process consultant", "process consultant", "functional consultant", "advisory consultant",
      "process design", "future state", "future-state", "current state", "current-state",
      "workshop facilitation", "requirements gathering", "user stories", "acceptance criteria",
      "strategic portfolio management", "spm", "project portfolio management", "ppm", "itsm",
      "itom", "itam", "hrsd",
    ],
  },
];

const technicalSignals = [
  "javascript", "typescript", "html", "css", "custom application development", "scoped application",
  "widget development", "ui builder development", "script include", "business rule scripting",
  "client script", "server-side scripting", "api development", "rest integration development",
  "soap integration development", "hands-on developer", "servicenow developer", "technical architect",
  "certified technical architect", "cta required", "certified master architect", "cma required",
];

const roleRiskSignals = [
  "l3 support", "desktop support engineer", "service desk analyst", "system administrator",
  "platform administrator", "on-call support", "shift support", "junior consultant", "software engineer",
];

function unique(values: string[]) {
  return [...new Set(values)];
}

function matches(text: string, terms: string[]) {
  return terms.filter((term) => text.includes(term));
}

export function analyseJobDescription(rawText: string): JobAnalysis {
  const text = rawText.toLowerCase().replace(/\s+/g, " ").trim();

  if (text.length < 120) {
    return {
      recommendation: "review",
      primaryLane: "Outside current focus",
      confidence: "low",
      technicalHeaviness: 0,
      matchedSignals: [],
      cautionSignals: ["The description is too short for a reliable assessment."],
      explanation: "Paste the complete job description before making an application decision.",
    };
  }

  const laneScores = laneSignals.map((group) => {
    const found = matches(text, group.signals);
    return { lane: group.lane, found, score: found.length };
  });

  laneScores.sort((a, b) => b.score - a.score);
  const bestLane = laneScores[0];
  const technicalMatches = matches(text, technicalSignals);
  const riskMatches = matches(text, roleRiskSignals);
  const technicalHeaviness = Math.min(100, technicalMatches.length * 13 + riskMatches.length * 10);
  const totalPositive = laneScores.reduce((sum, item) => sum + item.score, 0);

  let recommendation: JobRecommendation = "review";
  if (technicalHeaviness >= 65 || riskMatches.length >= 2) {
    recommendation = "skip";
  } else if (bestLane.score >= 4 && technicalHeaviness <= 35) {
    recommendation = "apply";
  }

  const primaryLane: RoleLane = bestLane.score > 0 ? bestLane.lane : "Outside current focus";
  const confidence = totalPositive >= 8 ? "high" : totalPositive >= 3 ? "medium" : "low";
  const matchedSignals = unique(bestLane.found).slice(0, 10);
  const cautionSignals = unique([...technicalMatches, ...riskMatches]).slice(0, 10);

  const explanation =
    recommendation === "apply"
      ? "The role aligns with a priority career lane and does not appear overly developer-heavy. Validate mandatory experience, location and work-authorisation requirements before applying."
      : recommendation === "skip"
        ? "The role appears too technical, support-led or materially outside the agreed seniority and transformation focus."
        : "The role has relevant signals, but the evidence is mixed. Review mandatory requirements and map them against approved Career Truth evidence before applying.";

  return {
    recommendation,
    primaryLane,
    confidence,
    technicalHeaviness,
    matchedSignals,
    cautionSignals,
    explanation,
  };
}
