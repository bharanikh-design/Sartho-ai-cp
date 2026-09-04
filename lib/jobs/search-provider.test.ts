import { describe, expect, it } from "vitest";
import { mapAdzunaResult, mapJSearchResult } from "./search-provider";

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
