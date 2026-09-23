import { describe, expect, it } from "vitest";
import {
  deduplicateSearchResults,
  isJunkEmployer,
  isMarketLocationConsistent,
  sanitizeEmployer,
} from "./location-guard";

describe("isJunkEmployer and sanitizeEmployer", () => {
  it("identifies generic scraper placeholder employers", () => {
    expect(isJunkEmployer("Job Details")).toBe(true);
    expect(isJunkEmployer("JOB DETAILS")).toBe(true);
    expect(isJunkEmployer("job details")).toBe(true);
    expect(isJunkEmployer("Job Description")).toBe(true);
    expect(isJunkEmployer("Employer Not Specified")).toBe(true);
    expect(isJunkEmployer("Confidential")).toBe(true);
    expect(isJunkEmployer("Hiring Organization")).toBe(true);
    expect(isJunkEmployer("Full-time")).toBe(true);
    expect(isJunkEmployer("Part-time")).toBe(true);
  });

  it("identifies valid employer names", () => {
    expect(isJunkEmployer("Department of Industry")).toBe(false);
    expect(isJunkEmployer("Deloitte")).toBe(false);
    expect(isJunkEmployer("PwC")).toBe(false);
    expect(isJunkEmployer("Urbane Recruitment")).toBe(false);
  });

  it("sanitizes junk employers to null", () => {
    expect(sanitizeEmployer("Job Details")).toBeNull();
    expect(sanitizeEmployer("Department of Industry")).toBe("Department of Industry");
    expect(sanitizeEmployer(null)).toBeNull();
    expect(sanitizeEmployer(undefined)).toBeNull();
  });
});

describe("isMarketLocationConsistent", () => {
  it("rejects US roles leaking into Australian searches", () => {
    // Exactly the job from production screenshot
    const floridaJob = {
      title: "Financial Analyst II - Jupiter, FL",
      employer: "University of Florida",
      location: "Palm Beach, Pittwater Area", // Adzuna's hallucinated AU location
    };
    expect(isMarketLocationConsistent(floridaJob, "au")).toBe(false);

    const texasJob = {
      title: "Data Analyst, Austin, TX",
      employer: "Tech Corp",
      location: "Sydney, NSW",
    };
    expect(isMarketLocationConsistent(texasJob, "au")).toBe(false);

    const californiaJob = {
      title: "Software Engineer (Sunnyvale, CA)",
      employer: "Startup Inc",
      location: "Melbourne, VIC",
    };
    expect(isMarketLocationConsistent(californiaJob, "au")).toBe(false);

    const univFlorida = {
      title: "Staff Accountant",
      employer: "University of Florida",
      location: "Sydney",
    };
    expect(isMarketLocationConsistent(univFlorida, "au")).toBe(false);
  });

  it("allows authentic Australian roles", () => {
    const sydneyJob = {
      title: "Graduate – Investment Banking Analyst",
      employer: "Urbane Recruitment",
      location: "The Rocks, Sydney",
    };
    expect(isMarketLocationConsistent(sydneyJob, "au")).toBe(true);

    const parramattaJob = {
      title: "Assistant Finance Analyst",
      employer: "Department of Industry",
      location: "Parramatta, Parramatta Area",
    };
    expect(isMarketLocationConsistent(parramattaJob, "au")).toBe(true);

    // Ensure Perth, WA (Western Australia) is NOT rejected
    const perthJob = {
      title: "Graduate Analyst",
      employer: "BHP",
      location: "Perth, WA",
    };
    expect(isMarketLocationConsistent(perthJob, "au")).toBe(true);
  });

  it("allows US roles when market is US", () => {
    const floridaJob = {
      title: "Financial Analyst II - Jupiter, FL",
      employer: "University of Florida",
      location: "Palm Beach, FL",
    };
    expect(isMarketLocationConsistent(floridaJob, "us")).toBe(true);
  });
});

describe("deduplicateSearchResults", () => {
  it("deduplicates identical jobs and prefers legitimate employer over scraper placeholder", () => {
    const results = [
      {
        title: "Assistant Finance Analyst",
        employer: "Department of Industry",
        location: "Parramatta, Parramatta Area",
        overallMatch: 34,
        applyDirect: false,
      },
      {
        title: "Assistant Finance Analyst",
        employer: "Job Details", // Scraper placeholder
        location: "Parramatta, Parramatta Area",
        overallMatch: 34,
        applyDirect: false,
      },
    ];

    const deduplicated = deduplicateSearchResults(results);
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].employer).toBe("Department of Industry");
  });

  it("does not collapse different employers hiring the same title in the same city", () => {
    const results = [
      { title: "Project Manager", employer: "Siemens", location: "Singapore", overallMatch: 75, applyDirect: true },
      { title: "Project Manager", employer: "GE", location: "Singapore", overallMatch: 74, applyDirect: true },
    ];
    expect(deduplicateSearchResults(results)).toHaveLength(2);
  });

  it("preserves source provenance while direct employer wins", () => {
    const results = [
      { title: "Mechanical Engineer", employer: "Acme", location: "Singapore", overallMatch: 88, applyDirect: false, source: "Google for Jobs", platforms: ["LinkedIn"], description: "short" },
      { title: "Mechanical Engineer", employer: "Acme", location: "Singapore", overallMatch: 70, applyDirect: true, source: "Company Careers", platforms: ["Acme"], description: "the complete employer advert" },
    ];
    const [job] = deduplicateSearchResults(results);
    expect(job.applyDirect).toBe(true);
    expect(job.source).toBe("Company Careers");
    expect(job.platforms).toEqual(expect.arrayContaining(["Acme", "Company Careers", "LinkedIn", "Google for Jobs"]));
  });

  it("prefers direct apply links when duplicate adverts exist", () => {
    const results = [
      {
        title: "Graduate Analyst",
        employer: "Deloitte",
        location: "Sydney, NSW",
        overallMatch: 80,
        applyDirect: false,
      },
      {
        title: "Graduate Analyst",
        employer: "Deloitte",
        location: "Sydney, NSW",
        overallMatch: 80,
        applyDirect: true,
      },
    ];

    const deduplicated = deduplicateSearchResults(results);
    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0].applyDirect).toBe(true);
  });
});
