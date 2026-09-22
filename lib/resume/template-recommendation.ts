import type { ResumeContent } from "./content";
import { resumeMarket, type ResumeMarket } from "./markets";
import type { ResumeTemplateId } from "./templates";

export type TemplateRecommendation = {
  template: ResumeTemplateId;
  reasons: string[];
  alternatives: ResumeTemplateId[];
};

const ENGINEERING = /mechanical|electrical|civil|automotive|manufactur|engineering|hvac|mechatronic|aerospace|structural|cad|solidworks|ansys|autocad|bim|revit|iso\s?\d|asme|systems engineer/i;
const TECHNOLOGY = /software|cloud|platform|data|machine learning|ai|devops|kubernetes|aws|azure|servicenow|cyber|technology/i;
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
  const reasons: string[] = [];
  let preferred: ResumeTemplateId;

  if (ENGINEERING.test(text)) {
    preferred = "engineering";
    reasons.push("Your résumé is engineering-led, so projects, standards, certifications and technical disciplines deserve first-class hierarchy.");
  } else if (TECHNOLOGY.test(text)) {
    preferred = "systems";
    reasons.push("Your profile is technology/platform-led, so grouped technical capability should be visible before the career detail.");
  } else if (EXECUTIVE.test(text) || (content.roles.length >= 5 && CONSULTING.test(text))) {
    preferred = "executive";
    reasons.push("Your résumé reads as senior leadership/professional services, where an executive hierarchy fits the profile better than a skills-first layout.");
  } else {
    preferred = "modern";
    reasons.push("Your profile benefits from a restrained, broadly accepted single-column professional layout.");
  }

  reasons.push(`${market.name}: ${market.guidance}`);
  const marketWinners = market.winners;
  const template = marketWinners.includes(preferred) || preferred === "engineering" ? preferred : marketWinners[0];
  if (template !== preferred) reasons.push(`${market.name} conventions make ${template} the stronger default for this application.`);

  return {
    template,
    reasons,
    alternatives: [...new Set([preferred, ...marketWinners])].filter((id) => id !== template).slice(0, 3),
  };
}
