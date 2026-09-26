import type { ResumeContent } from "./content";
import { resumeMarket, type ResumeMarket } from "./markets";
import { resumeTemplate, type ResumeTemplateId } from "./templates";

export type TemplateRecommendation = {
  template: ResumeTemplateId;
  /** Why this template, read off what the résumé actually says. */
  reason: string;
  /**
   * Set only when market convention moved the pick off the content preference,
   * because that is the one case where the answer needs explaining twice.
   *
   * The market's own guidance used to be appended here as a second reason. The
   * Studio prints `market.guidance` verbatim in the block directly above the
   * template row, so carrying it in here too put the same sentence on screen
   * twice — and made callers index into an array to find the part that was
   * actually about the template.
   */
  marketNote: string | null;
  alternatives: ResumeTemplateId[];
};

/*
 * Short alternatives are anchored to word boundaries, because `corpus()` joins
 * the target role, the summary, every bullet, every skill and every
 * certification into one string — so any substring that can hide inside an
 * ordinary word will be found in a résumé of any length.
 *
 * Unanchored, these were not close calls. `ai` matched "detail", "available",
 * "training", "maintain", "chair" and "campaign"; `cad` matched "decade";
 * `revit` matched "revitalised"; `bim` and `civil` had the same problem in
 * "bimonthly" and "civilian" — the latter matters because an ex-military
 * candidate writing "transition to a civilian role" is not a civil engineer. A retail manager whose summary said
 * "detail-oriented" was told their profile was technology/platform-led, and
 * anyone writing "a decade of experience" was handed the engineering layout.
 *
 * Nothing caught this because nothing called this function. `autocad` keeps its
 * own alternative, so anchoring `cad` costs no real match.
 */
const ENGINEERING = /mechanical|electrical|\bcivil(?!ian)|automotive|manufactur|engineering|hvac|mechatronic|aerospace|structural|\bcad\b|solidworks|ansys|autocad|\bbim\b|\brevit\b|iso\s?\d|asme|systems engineer/i;
const TECHNOLOGY = /software|cloud|platform|\bdata|machine learning|\bai\b|devops|kubernetes|\baws\b|azure|servicenow|cyber|technology/i;
const EXECUTIVE = /director|vice president|\bvp\b|head of|chief|partner|principal|general manager|engagement manager|programme director|program director/i;
const CONSULTING = /consult|advisory|strategy|transformation|client engagement|professional services/i;

function corpus(content: ResumeContent) {
  return [
    content.targetRole, content.summary,
    ...content.roles.flatMap((role) => [role.title, role.employer, ...role.bullets.map((b) => b.text)]),
    ...content.skills, ...content.skillGroups.flatMap((group) => [group.name, ...group.skills]),
    ...content.certifications.map((cert) => [cert.name, cert.issuer].join(" ")),
  ].join(" ");
}

export function recommendTemplate(content: ResumeContent, marketId: ResumeMarket = "global"): TemplateRecommendation {
  const market = resumeMarket(marketId);
  const text = corpus(content);
  let preferred: ResumeTemplateId;
  let reason: string;

  if (ENGINEERING.test(text)) {
    preferred = "engineering";
    reason = "Your résumé is engineering-led, so projects, standards, certifications and technical disciplines deserve first-class hierarchy.";
  } else if (TECHNOLOGY.test(text)) {
    preferred = "systems";
    reason = "Your profile is technology/platform-led, so grouped technical capability should be visible before the career detail.";
  } else if (EXECUTIVE.test(text) || (content.roles.length >= 5 && CONSULTING.test(text))) {
    preferred = "executive";
    reason = "Your résumé reads as senior leadership/professional services, where an executive hierarchy fits the profile better than a skills-first layout.";
  } else {
    preferred = "modern";
    reason = "Your profile benefits from a restrained, broadly accepted single-column professional layout.";
  }

  /*
   * Engineering overrides market convention deliberately. A mechanical
   * engineer's résumé needs the layout that gives standards and certifications
   * their own standing wherever it is being sent; no market prefers burying
   * them.
   */
  const marketWinners = market.winners;
  const template = marketWinners.includes(preferred) || preferred === "engineering" ? preferred : marketWinners[0];

  return {
    template,
    reason,
    marketNote: template === preferred
      ? null
      : `${market.name} conventions make ${resumeTemplate(template).name} the stronger default for this application.`,
    alternatives: [...new Set([preferred, ...marketWinners])].filter((id) => id !== template).slice(0, 3),
  };
}
