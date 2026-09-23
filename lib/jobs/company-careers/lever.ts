import type { JobSearchResult } from "@/lib/jobs/search-provider";
import type { DirectCareerQuery, EmployerPortalConfig } from "./types";

type LeverPosting = {
  text?: string;
  hostedUrl?: string;
  applyUrl?: string;
  createdAt?: number;
  categories?: { location?: string; commitment?: string; team?: string };
  descriptionPlain?: string;
};

export async function searchLeverPortal(config: EmployerPortalConfig, query: DirectCareerQuery, timeoutMs = 8_000): Promise<JobSearchResult[]> {
  const endpoint = `https://api.lever.co/v0/postings/${encodeURIComponent(config.tenant)}?mode=json&limit=100`;
  const response = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Lever request failed with status ${response.status}`);
  const postings = (await response.json()) as LeverPosting[];
  const search = query.searchText.toLowerCase().trim();
  const location = query.location?.toLowerCase().trim();
  return postings
    .filter((posting) => {
      const titleOk = !search || (posting.text ?? "").toLowerCase().includes(search);
      const locationOk = !location || (posting.categories?.location ?? "").toLowerCase().includes(location);
      return titleOk && locationOk;
    })
    .slice(0, query.limit ?? 20)
    .flatMap((posting): JobSearchResult[] => {
      const title = posting.text?.trim();
      const url = posting.hostedUrl?.trim() || posting.applyUrl?.trim();
      if (!title || !url) return [];
      return [{
        title,
        employer: config.name,
        location: posting.categories?.location?.trim() || null,
        description: posting.descriptionPlain?.trim().slice(0, 1200) || `${title} at ${config.name}`,
        url,
        salary: null,
        postedAt: posting.createdAt ? new Date(posting.createdAt).toISOString() : null,
        source: "Company Careers",
        platforms: [config.name, "Direct Apply"],
        applyDirect: true,
      }];
    });
}
