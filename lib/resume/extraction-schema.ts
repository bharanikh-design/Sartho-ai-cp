/*
 * What Sartho asks a model to produce from one résumé.
 *
 * This lived inside the import route, which meant the only way to find out
 * whether a provider would accept it was to upload a CV on production and see.
 * Four consecutive failures were found that way, one round trip apart, by the
 * person the product is for. It sits here so a test can send the real schema —
 * not a small stand-in that happens to pass — at the real endpoint.
 */

export const RESUME_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["roles", "evidence", "headline", "summary", "location", "country", "totalExperienceYears", "fullName", "phone", "linkedin", "website"],
  properties: {
    roles: {
      type: "array",
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["employer", "title", "location", "startDate", "endDate", "isCurrent", "summary"],
        properties: {
          employer: { type: "string" },
          title: { type: "string" },
          location: { type: ["string", "null"] },
          startDate: { type: ["string", "null"] },
          endDate: { type: ["string", "null"] },
          isCurrent: { type: "boolean" },
          summary: { type: ["string", "null"] },
        },
      },
    },
    evidence: {
      type: "array",
      maxItems: 120,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["employer", "title", "claim", "context", "periodLabel", "metrics", "domains", "confidence"],
        properties: {
          employer: { type: ["string", "null"] },
          title: { type: ["string", "null"] },
          claim: { type: "string" },
          context: { type: ["string", "null"] },
          periodLabel: { type: ["string", "null"] },
          metrics: { type: "array", maxItems: 8, items: { type: "string" } },
          domains: { type: "array", maxItems: 8, items: { type: "string" } },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
        },
      },
    },
    headline: { type: ["string", "null"] },
    summary: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    /*
     * The contact block, which no résumé goes without and Sartho had nowhere
     * to put. Every one of these is nullable and every one means "not stated"
     * rather than "not found yet" — a résumé printing a phone number nobody
     * supplied is worse than one printing none.
     */
    fullName: { type: ["string", "null"], description: "The person's name exactly as written at the top of the document. Null if the document does not state one." },
    phone: { type: ["string", "null"], description: "Their phone number as written, including any country code. Null when absent." },
    linkedin: { type: ["string", "null"], description: "Their LinkedIn profile, as written (e.g. linkedin.com/in/name). Null when absent." },
    website: { type: ["string", "null"], description: "A personal site, portfolio or GitHub, as written. Null when absent. Never their employer's website." },
    country: {
      type: ["string", "null"],
      description: "ISO-3166 alpha-2 code of the country the person is based in, lower-case (e.g. au, in, sg, us). Null when the résumé gives no reliable signal.",
    },
    totalExperienceYears: { type: ["number", "null"] },
  },
};

export const RESUME_EXTRACTION_SYSTEM = [
  "You are Sartho's evidence extractor. You read one résumé and record what it says.",
  "You are not a writer, an editor or a marketer. Do not improve, embellish or reword achievements into stronger claims.",
  "Never state an employer, job title, date, metric, technology, certification or responsibility that is not present in the document.",
  "Every claim must be traceable to a specific line of the résumé. If the résumé is vague, record the vague version.",
  "Put a figure in metrics only when that figure appears in the document. Never estimate, round or infer one.",
  "Set confidence to high when the résumé states the claim outright, medium when it is implied by context, and low when it is a summary of scattered detail.",
  "Attribute every claim to the employer and title it sits under. Leave both null when the résumé does not make that clear.",
  "Dates must be YYYY, YYYY-MM or YYYY-MM-DD exactly as precise as the document is. Use null when a date is absent, and never guess one.",
  "Split responsibilities into separate claims rather than merging several into one sentence.",
  "Copy fullName, phone, linkedin and website verbatim from the document; never reformat, complete or invent one, and use null when the document does not state it.",
  "For country, infer the ISO-3166 alpha-2 code (lower-case) of where the person is based from concrete signals in the document: a stated address or city, a phone dialling code (+61 au, +91 in, +65 sg, +1 us, +44 gb), the location of their current employer or university, or stated work rights. Use null when those signals are absent or conflict; never guess from a name.",
].join(" ");

export const RESUME_EXTRACTION_SCHEMA_NAME = "sartho_resume_extraction";
