import { z } from "zod";

/*
 * What Sartho asks for when the résumé is not about any particular advert.
 *
 * The tailored draft's rules exist to stop it inventing; these are the same
 * rules with the advert removed. There is no job description to align to, no
 * requirement mapping, and no change log — nothing was emphasised for anybody,
 * so there is nothing to explain.
 *
 * What replaces the target role is a headline the person could put at the top
 * of their own CV, drawn from what the evidence actually shows rather than from
 * an ambition. "ServiceNow delivery lead, ITSM and ITOM" is a reading of a
 * career; "Visionary transformation leader" is a claim nobody can check.
 */

export const MASTER_RESUME_RULES = [
  "You assemble a person's master résumé from their approved career evidence. It is not aimed at any advertised role.",
  "Never create or infer an employer, date, job title, skill, metric, certification, responsibility or outcome. Everything you write must already be in the evidence you were given.",
  "Every bullet must cite at least one supplied evidence ID that directly supports its wording.",
  "Place each bullet under the employment role it happened in, citing that role's id in experience[].roleId. Use only the role ids supplied — the employment history is given to you and is not yours to add to.",
  "Order each role's bullets strongest first: the ones showing the largest scope, the clearest outcome, or the most senior responsibility.",
  "Write each bullet the way a person speaks to a hiring manager: what they did, at what scope, and what came of it. Open on a real action — led, cut, built, negotiated, migrated — never on 'responsible for', 'helped with', 'assisted with' or 'worked on'.",
  "Use the active voice throughout. 'Cut incident volume' rather than 'incident volume was cut'.",
  "Never describe the person with a claim no reader could verify: results-driven, detail-oriented, team player, passionate, hard-working, proven track record, excellent communicator, go-getter, think outside the box, synergy. State what they did instead.",
  "Do not open more than two bullets in the same role with the same verb, and do not repeat a distinctive phrase across roles.",
  "A figure is welcome where the evidence states one, and never invented where it does not. A line naming real scope — four business units, three countries, an eleven-person team — is strong without a percentage.",
  "Keep each bullet to one or two lines. A bullet longer than that is a paragraph and will not be read.",
  "Present tense for a role still held, past tense for every other.",
  "The professional summary is three to four sentences, in the person's own register, naming what they do, the scale they do it at, and the domains the evidence covers. No adjectives about their character.",
  "The headline is the job title a person like this would put at the top of their CV, read off the evidence rather than aspired to.",
].join(" ");

/*
 * No minItems or maxItems anywhere. OpenAI's strict structured outputs answer
 * 400 to both, and while Sartho now filters them out before sending, a schema
 * that never needed filtering is one less thing to go wrong. Bounds belong in
 * the Zod parse below, where they are actually enforced.
 */
export const MASTER_RESUME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "professionalSummary", "experience"],
  properties: {
    headline: { type: "string", description: "The job title this person would put at the top of their own CV." },
    professionalSummary: { type: "string" },
    experience: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["roleId", "bullets"],
        properties: {
          roleId: { type: "string" },
          bullets: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "evidenceIds"],
              properties: {
                text: { type: "string" },
                evidenceIds: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
    },
  },
};

export const masterResumeOutput = z.object({
  headline: z.string().trim().min(1),
  professionalSummary: z.string().trim().min(1),
  experience: z.array(
    z.object({
      roleId: z.string().trim().min(1),
      bullets: z.array(
        z.object({
          text: z.string().trim().min(1),
          evidenceIds: z.array(z.string().trim().min(1)),
        }),
      ),
    }),
  ),
});
