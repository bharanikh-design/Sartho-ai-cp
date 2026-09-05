import { describe, expect, it } from "vitest";
import {
  adzunaCoversCountry,
  buildAdzunaUrl,
  buildJSearchParams,
  mapAdzunaResult,
  mapJSearchResult,
  normaliseAdzunaCountry,
  providersForCountry,
} from "./search-provider";

describe("normaliseAdzunaCountry", () => {
  it("takes the first of a comma list and lowercases it", () => {
    expect(normaliseAdzunaCountry("AU,SG,UK")).toBe("au");
    expect(normaliseAdzunaCountry("au, sg")).toBe("au");
  });
  it("maps uk to gb and keeps valid codes", () => {
    expect(normaliseAdzunaCountry("uk")).toBe("gb");
    expect(normaliseAdzunaCountry("sg")).toBe("sg");
  });
  it("falls back to gb for empty or unsupported values", () => {
    expect(normaliseAdzunaCountry(undefined)).toBe("gb");
    expect(normaliseAdzunaCountry("narnia")).toBe("gb");
  });
});

describe("mapAdzunaResult", () => {
  it("maps a complete Adzuna record into Sartho's shape", () => {
    const result = mapAdzunaResult({
      title: "  Senior Engagement Manager  ",
      company: { display_name: "Example Corp" },
      location: { display_name: "Sydney" },
      description: "Lead client engagements across the region.",
      redirect_url: "https://www.adzuna.com/land/ad/123",
      salary_min: 120000,
      salary_max: 150000,
      created: "2026-09-01T00:00:00Z",
    });

    expect(result).toEqual({
      title: "Senior Engagement Manager",
      employer: "Example Corp",
      location: "Sydney",
      description: "Lead client engagements across the region.",
      url: "https://www.adzuna.com/land/ad/123",
      salary: "120,000–150,000",
      postedAt: "2026-09-01T00:00:00Z",
      source: "Adzuna",
    });
  });

  it("drops a record missing a title, link or description", () => {
    expect(mapAdzunaResult({ company: { display_name: "X" }, description: "d", redirect_url: "https://x" })).toBeNull();
    expect(mapAdzunaResult({ title: "T", description: "d" })).toBeNull();
    expect(mapAdzunaResult({ title: "T", redirect_url: "https://x" })).toBeNull();
  });

  it("leaves optional fields null and omits an absent salary", () => {
    const result = mapAdzunaResult({
      title: "Analyst",
      description: "Do the analysis.",
      redirect_url: "https://x/1",
    });
    expect(result?.employer).toBeNull();
    expect(result?.location).toBeNull();
    expect(result?.salary).toBeNull();
    expect(result?.postedAt).toBeNull();
  });
});

describe("mapJSearchResult", () => {
  it("maps a Google-for-Jobs record and joins the location parts", () => {
    const result = mapJSearchResult({
      job_title: "Business Analyst",
      employer_name: "Deloitte",
      job_description: "Deliver analysis for consulting engagements.",
      job_apply_link: "https://deloitte.com/careers/123",
      job_city: "Sydney",
      job_state: "NSW",
      job_country: "AU",
      job_posted_at_datetime_utc: "2026-09-01T00:00:00Z",
      job_min_salary: 90000,
      job_max_salary: 110000,
    });

    expect(result).toEqual({
      title: "Business Analyst",
      employer: "Deloitte",
      location: "Sydney, NSW, AU",
      description: "Deliver analysis for consulting engagements.",
      url: "https://deloitte.com/careers/123",
      salary: "90,000–110,000",
      postedAt: "2026-09-01T00:00:00Z",
      source: "Google for Jobs",
    });
  });

  it("drops a record missing a title, link or description", () => {
    expect(mapJSearchResult({ employer_name: "X", job_description: "d", job_apply_link: "https://x" })).toBeNull();
    expect(mapJSearchResult({ job_title: "T", job_apply_link: "https://x" })).toBeNull();
  });
});

describe("country-aware provider selection", () => {
  it("keeps JSearch for any market and Adzuna only where it has an endpoint", () => {
    expect(providersForCountry("au", ["jsearch", "adzuna"])).toEqual(["jsearch", "adzuna"]);
    expect(providersForCountry("ae", ["jsearch", "adzuna"])).toEqual(["jsearch"]);
    expect(providersForCountry("ae", ["adzuna"])).toEqual([]);
    expect(adzunaCoversCountry("IN")).toBe(true);
    expect(adzunaCoversCountry("hk")).toBe(false);
  });
});

describe("query → provider request mapping", () => {
  const credentials = { appId: "id", appKey: "key" };

  it("puts the country in Adzuna's path and the city, employer in its params", () => {
    const url = new URL(buildAdzunaUrl({ keywords: "Business Analyst", country: "au", location: "Sydney", employer: "PwC" }, credentials));
    expect(url.pathname).toBe("/v1/api/jobs/au/search/1");
    expect(url.searchParams.get("what")).toBe("Business Analyst");
    expect(url.searchParams.get("where")).toBe("Sydney");
    expect(url.searchParams.get("company")).toBe("PwC");
  });

  it("embeds employer and city in JSearch's free-text query and scopes by country", () => {
    const params = buildJSearchParams({ keywords: "Business Analyst", country: "au", location: "Sydney", employer: "PwC", remoteOnly: true });
    expect(params.get("query")).toBe("Business Analyst at PwC in Sydney");
    expect(params.get("country")).toBe("au");
    expect(params.get("work_from_home")).toBe("true");
    expect(buildJSearchParams({ keywords: "Data Analyst", country: "in" }).get("query")).toBe("Data Analyst");
  });
});
