import type { ResumeContent } from "@/lib/resume/content";

/*
 * The filters, before the ranking.
 *
 * A résumé is discarded by a real applicant tracking system for three
 * reasons, none of which is a low score: the parser could not read it, a
 * knockout question failed, or a recruiter's search never surfaced it. The
 * score in ats.ts answers "how does this read and rank"; this file answers
 * the earlier question, "does it get that far". The two are shown apart,
 * because blending a pass/fail gate into a percentage hides the one thing
 * that actually loses interviews.
 *
 * Everything here is judged on the document's structure, not its prose. A
 * date that does not parse, a role out of order, a contact block with no
 * phone number: these are what a parser and a filter see.
 */

export type GateCheck = {
  label: string;
  state: "pass" | "warn" | "fail";
  detail: string;
};

export type GateResult = {
  checks: GateCheck[];
  /** No check failed. Warnings are worth a look and do not block. */
  passes: boolean;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/*
 * A résumé date as a month index: years since zero times twelve, plus the
 * month. Year-only dates are placed in January, and a caller that compares
 * two of them allows for that. Null when no year can be found at all.
 */
export function monthIndex(value: string, now = new Date()): number | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (/\b(present|current|now|to date|ongoing)\b/.test(text)) return now.getFullYear() * 12 + now.getMonth();
  const year = text.match(/\b((?:19|20)\d{2})\b/);
  if (!year) return null;
  const named = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  const numeric = text.match(/\b(\d{1,2})\s*[/.-]\s*(?:19|20)\d{2}\b/);
  const month = named ? MONTHS.indexOf(named[1]) : numeric ? Math.min(11, Math.max(0, Number(numeric[1]) - 1)) : 0;
  return Number(year[1]) * 12 + month;
}

/** Whether a date string carries enough for a parser: a four-digit year, or a word meaning "now". */
export function dateParses(value: string): boolean {
  return monthIndex(value) !== null;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function gateChecks(content: ResumeContent, now = new Date()): GateResult {
  const checks: GateCheck[] = [];
  const { contact } = content;

  /* A filter that cannot reach you has no reason to keep you. */
  const reach = [contact.email.trim(), contact.phone.trim()].filter(Boolean).length;
  checks.push({
    label: "Reachable",
    state: reach === 2 ? "pass" : reach === 1 ? "warn" : "fail",
    detail: reach === 2
      ? "Email and phone are both on the page."
      : reach === 1
        ? `Only ${contact.email.trim() ? "an email address" : "a phone number"} is given. Most recruiters filter on both.`
        : "No email address or phone number. Nothing else on the page matters if nobody can reply.",
  });

  checks.push({
    label: "Location stated",
    state: contact.location.trim() ? "pass" : "warn",
    detail: contact.location.trim()
      ? `Location reads "${contact.location.trim()}".`
      : "No location. Location is a knockout filter on most roles; a city and country is enough.",
  });

  const roles = content.roles;
  if (!roles.length) {
    checks.push({ label: "Dated employment", state: "fail", detail: "No dated roles. A parser builds the work history from them, and a filter on years of experience reads nothing." });
  } else {
    const undated = roles.filter((role) => !role.start.trim() || (!role.current && !role.end.trim()));
    checks.push({
      label: "Dated employment",
      state: undated.length === 0 ? "pass" : undated.length < roles.length ? "warn" : "fail",
      detail: undated.length === 0
        ? `All ${plural(roles.length, "role")} carry a start and an end.`
        : `${plural(undated.length, "role")} missing a start or end date: ${undated.map((role) => role.title.trim() || role.employer.trim() || "untitled").join(", ")}.`,
    });

    const unparsed = roles.filter((role) => (role.start.trim() && !dateParses(role.start)) || (!role.current && role.end.trim() && !dateParses(role.end)));
    checks.push({
      label: "Dates a parser can read",
      state: unparsed.length ? "fail" : "pass",
      detail: unparsed.length
        ? `${plural(unparsed.length, "date")} carry no four-digit year, which parsers cannot place: ${unparsed.map((role) => `"${role.start.trim()} – ${role.current ? "Present" : role.end.trim()}"`).join(", ")}. Write "Mar 2021" or "2021".`
        : "Every date carries a year, as \"Mar 2021\" or \"2021 – Present\".",
    });

    const starts = roles.map((role) => monthIndex(role.start, now));
    const ordered = starts.every((value, index) => index === 0 || value === null || starts[index - 1] === null || (starts[index - 1] as number) >= value);
    checks.push({
      label: "Newest role first",
      state: ordered ? "pass" : "fail",
      detail: ordered
        ? "Roles run from the most recent back, which is the order every parser and reader expects."
        : "Roles are not in reverse chronological order. Parsers assume the first role is the current one.",
    });

    /*
     * A gap is judged month to month where months are given, and only when
     * the years differ by more than one where they are not — a résumé that
     * says "2019 – 2021" then "2021 – Present" has no gap a reader would
     * notice, whatever January-to-January arithmetic says.
     */
    const gaps: string[] = [];
    for (let index = 0; index < roles.length - 1; index += 1) {
      const newer = roles[index];
      const older = roles[index + 1];
      const newerStart = monthIndex(newer.start, now);
      const olderEnd = older.current ? monthIndex("present", now) : monthIndex(older.end, now);
      if (newerStart === null || olderEnd === null) continue;
      const yearOnly = !/[a-z]|\d{1,2}\s*[/.-]/i.test(`${newer.start} ${older.end}`);
      const months = newerStart - olderEnd;
      if ((yearOnly && months > 12) || (!yearOnly && months > 6)) {
        gaps.push(`${Math.round(months / 12 * 10) / 10} years between ${older.employer.trim() || older.title.trim() || "a role"} and ${newer.employer.trim() || newer.title.trim() || "the next"}`);
      }
    }
    checks.push({
      label: "No unexplained gaps",
      state: gaps.length ? "warn" : "pass",
      detail: gaps.length
        ? `${gaps.join("; ")}. A gap is not a fault, but an unexplained one is a question a filter answers for you.`
        : "No gap of more than six months between roles.",
    });
  }

  /* Parsers key on conventional headings; a résumé with none is a wall of text to them. */
  const present = [
    content.summary.trim() ? "summary" : "",
    roles.length ? "experience" : "",
    content.skills.length || content.skillGroups.length ? "skills" : "",
    content.education.length ? "education" : "",
  ].filter(Boolean);
  const missing = ["summary", "experience", "skills", "education"].filter((section) => !present.includes(section));
  checks.push({
    label: "Standard sections",
    state: missing.length === 0 ? "pass" : missing.includes("experience") ? "fail" : "warn",
    detail: missing.length === 0
      ? "Summary, experience, skills and education are all present under the headings parsers look for."
      : `Missing: ${missing.join(", ")}. Parsers map the page by these headings.`,
  });

  return { checks, passes: checks.every((check) => check.state !== "fail") };
}

/*
 * The same skill, written the way people write it.
 *
 * Recruiter searches and most screens match exact phrases plus the common
 * short forms, so a draft that says "K8s" for a role asking "Kubernetes" is
 * scored as if it said nothing. Each entry maps a canonical term to the
 * variants that mean it; matching runs both ways.
 */
const VARIANTS: Array<[string, string[]]> = [
  ["kubernetes", ["k8s"]],
  ["microsoft intune", ["intune"]],
  ["amazon web services", ["aws"]],
  ["google cloud platform", ["gcp", "google cloud"]],
  ["microsoft azure", ["azure"]],
  ["continuous integration", ["ci/cd", "ci cd", "cicd"]],
  ["continuous delivery", ["ci/cd", "ci cd", "cicd"]],
  ["javascript", ["js"]],
  ["typescript", ["ts"]],
  ["machine learning", ["ml"]],
  ["artificial intelligence", ["ai"]],
  ["servicenow", ["service now"]],
  ["power bi", ["powerbi"]],
  ["end user computing", ["euc"]],
  ["it service management", ["itsm"]],
  ["it operations management", ["itom"]],
  ["site reliability engineering", ["sre"]],
  ["infrastructure as code", ["iac"]],
  ["postgresql", ["postgres"]],
  ["functional safety", ["iso 26262"]],
  ["automotive spice", ["aspice"]],
  ["advanced product quality planning", ["apqp"]],
  ["failure mode and effects analysis", ["fmea"]],
  ["product lifecycle management", ["plm"]],
  ["computer-aided design", ["cad"]],
  ["electric vehicle", ["ev"]],
  ["advanced driver assistance systems", ["adas"]],
  ["user experience", ["ux"]],
  ["user interface", ["ui"]],
  ["structured query language", ["sql"]],
];

function canonical(value: string) {
  return ` ${value.toLowerCase().replace(/[^a-z0-9/]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

/** Every spelling a term may take on the page, the term itself first. */
export function termVariants(term: string): string[] {
  const base = canonical(term).trim();
  const out = new Set<string>([base]);
  for (const [name, aliases] of VARIANTS) {
    if (base === name || aliases.includes(base)) {
      out.add(name);
      for (const alias of aliases) out.add(alias);
    }
  }
  /* "Microsoft Intune" is also "Intune"; a vendor prefix is rarely how people write it in a bullet. */
  const stripped = base.replace(/^(microsoft|amazon|google|atlassian|adobe|oracle|sap|ibm)\s+/, "");
  if (stripped !== base && stripped.length >= 3) out.add(stripped);
  return [...out];
}

/** Whether a term, in any of its spellings, appears in the text. */
export function mentions(text: string, term: string): boolean {
  const haystack = canonical(text);
  return termVariants(term).some((variant) => haystack.includes(` ${variant} `));
}

/*
 * The text a screen weights most: the career itself. Skills lists are read,
 * but a term that only ever appears in a list is a claim with no story, and
 * most ranking treats it accordingly.
 */
export function experienceText(content: ResumeContent): string {
  return [
    content.summary,
    ...content.roles.flatMap((role) => [role.title, ...role.bullets.map((bullet) => bullet.text)]),
    ...content.sections.flatMap((section) => section.bullets.map((bullet) => bullet.text)),
  ].join("\n");
}

const TITLE_NOISE = new Set([
  "senior", "junior", "lead", "principal", "staff", "head", "of", "and", "the", "a", "an", "for", "in", "at", "to",
  "sr", "jr", "i", "ii", "iii", "iv", "v", "level", "associate", "assistant", "chief", "vp", "vice", "president", "director",
  "manager", "specialist", "consultant", "remote", "hybrid", "contract", "permanent", "full", "time", "part",
]);

function titleTokens(value: string): string[] {
  return [...new Set(canonical(value).trim().split(" ").filter((token) => token.length >= 2 && !TITLE_NOISE.has(token)))];
}

/*
 * Whether the résumé's own title line reads like the advert's.
 *
 * The title is the most heavily weighted line in most screens and the first
 * thing a recruiter search matches. Seniority words are ignored on both
 * sides: "Senior Platform Engineer" against "Platform Engineer II" is a match
 * on what the job is, and the level is judged elsewhere.
 */
export function titleAlignment(content: ResumeContent, jobTitle: string): { share: number; matched: string[]; wanted: string[] } {
  const wanted = titleTokens(jobTitle);
  if (!wanted.length) return { share: 1, matched: [], wanted: [] };
  const own = new Set([...titleTokens(content.targetRole), ...titleTokens(content.roles[0]?.title ?? "")]);
  const matched = wanted.filter((token) => own.has(token));
  return { share: matched.length / wanted.length, matched, wanted };
}
