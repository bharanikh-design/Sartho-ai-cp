export type CareersSourceKind = "workday" | "greenhouse" | "lever" | "unknown";
export type CareersSourceDiscovery = {
  kind: CareersSourceKind;
  careersUrl: string;
  tenant: string | null;
  site: string | null;
  domain: string;
  confidence: "verified-pattern" | "unknown";
};

export function discoverCareersSource(rawUrl: string): CareersSourceDiscovery {
  const url = new URL(rawUrl);
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter(Boolean);

  if (host.endsWith(".myworkdayjobs.com")) {
    const tenant = host.split(".")[0] || null;
    const siteIndex = parts.findIndex((part) => /^en-[A-Z]{2}$/i.test(part));
    const site = siteIndex >= 0 ? parts[siteIndex + 1] ?? "Careers" : parts[0] ?? "Careers";
    return { kind: "workday", careersUrl: url.toString(), tenant, site, domain: host, confidence: "verified-pattern" };
  }

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    return { kind: "greenhouse", careersUrl: url.toString(), tenant: parts[0] ?? null, site: null, domain: host, confidence: "verified-pattern" };
  }

  if (host === "jobs.lever.co") {
    return { kind: "lever", careersUrl: url.toString(), tenant: parts[0] ?? null, site: null, domain: host, confidence: "verified-pattern" };
  }

  return { kind: "unknown", careersUrl: url.toString(), tenant: null, site: null, domain: host, confidence: "unknown" };
}
