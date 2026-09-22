import type { ResumeTemplateId } from "./templates";

export type ResumeMarket = "au" | "us" | "uk" | "sg" | "gcc" | "in" | "global";
export type ResumeMarketProfile = {
  id: ResumeMarket; name: string; flag: string; pageSize: "A4" | "Letter";
  length: string; photo: "avoid" | "optional"; personalDetails: string;
  spelling: "British" | "American"; winners: ResumeTemplateId[]; guidance: string;
};

export const RESUME_MARKETS: ResumeMarketProfile[] = [
  { id:"au", name:"Australia", flag:"🇦🇺", pageSize:"A4", length:"2–3 pages is normal for experienced candidates", photo:"avoid", personalDetails:"Avoid age, marital status and unnecessary personal data.", spelling:"British", winners:["executive","modern","compact"], guidance:"Give scope, outcomes and recent experience room; do not force a senior career into one page." },
  { id:"us", name:"USA", flag:"🇺🇸", pageSize:"Letter", length:"Prefer 1–2 pages; two is appropriate for experienced candidates", photo:"avoid", personalDetails:"Do not include age, marital status, nationality or other protected personal details.", spelling:"American", winners:["modern","systems","executive"], guidance:"Lead with impact and role relevance; keep older detail compressed." },
  { id:"uk", name:"United Kingdom", flag:"🇬🇧", pageSize:"A4", length:"Usually 2 pages; senior careers may need more when relevant", photo:"avoid", personalDetails:"Avoid date of birth, marital status and unnecessary personal data.", spelling:"British", winners:["executive","classic","modern"], guidance:"Use a concise profile, reverse chronology and evidence-led achievements." },
  { id:"sg", name:"Singapore", flag:"🇸🇬", pageSize:"A4", length:"Usually 2 pages; senior candidates can use more when evidence warrants it", photo:"avoid", personalDetails:"Keep personal data minimal; work-authorisation context can be useful when relevant.", spelling:"British", winners:["modern","executive","systems"], guidance:"Keep the document commercially focused, concise and easy to scan." },
  { id:"gcc", name:"UAE / GCC", flag:"🇦🇪", pageSize:"A4", length:"2–3 pages is common for experienced candidates", photo:"optional", personalDetails:"Location, availability and visa/work status can be useful; photo is employer/sector dependent.", spelling:"British", winners:["executive","modern","classic"], guidance:"Emphasise regional scope, programme scale, leadership and commercial outcomes." },
  { id:"in", name:"India", flag:"🇮🇳", pageSize:"A4", length:"1–2 pages early career; 2–3 for substantial experience", photo:"avoid", personalDetails:"Keep demographic/personal data out unless explicitly required.", spelling:"British", winners:["modern","systems","compact"], guidance:"Make skills, certifications, delivery scale and measurable outcomes easy to find." },
  { id:"global", name:"Global", flag:"🌐", pageSize:"A4", length:"2 pages is the safest default; preserve more when seniority requires it", photo:"avoid", personalDetails:"Use only professional contact information.", spelling:"British", winners:["modern","executive","systems"], guidance:"Use a conservative ATS-safe format when the destination market is unknown." },
];

export function resumeMarket(id: string | null | undefined) {
  return RESUME_MARKETS.find((market) => market.id === id) ?? RESUME_MARKETS[6];
}
