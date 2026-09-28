import { afterEach, describe, expect, it, vi } from "vitest";
import { findEmployerPortal } from "./registry";
import { buildWorkdayApiUrl, buildWorkdayJobUrl, mapWorkdayPosting, searchWorkdayPortal, type WorkdayPosting } from "./workday";
import type { EmployerPortalConfig } from "./types";

afterEach(() => vi.restoreAllMocks());

describe("findEmployerPortal", () => {
  it("matches known employers by exact name or alias", () => {
    expect(findEmployerPortal("PwC")?.id).toBe("pwc");
    expect(findEmployerPortal("pwc")?.id).toBe("pwc");
    expect(findEmployerPortal("PricewaterhouseCoopers")?.id).toBe("pwc");
    expect(findEmployerPortal("Accenture")?.id).toBe("accenture");
    expect(findEmployerPortal("CommBank")?.id).toBe("cba");
    expect(findEmployerPortal("Commonwealth Bank")?.id).toBe("cba");
    expect(findEmployerPortal("Canva")?.id).toBe("canva");
  });

  it("returns null for unknown employers", () => {
    expect(findEmployerPortal("Unknown Boutique Ltd")).toBeNull();
  });

  /*
   * These four used to be listed with invented Workday tenants, so a brief
   * naming them logged a DNS failure on every search. None of them is on
   * Workday; unknown is the honest answer, and it is what sends the person to
   * paste the real careers URL on the Search Brief.
   */
  it("does not pretend to know a portal for employers that are not on Workday", () => {
    for (const employer of ["Deloitte", "Deloitte Consulting", "KPMG", "EY", "Ernst & Young", "Macquarie Group"]) {
      expect(findEmployerPortal(employer), employer).toBeNull();
    }
  });
});

describe("Workday URL builders", () => {
  const config: EmployerPortalConfig = {
    id: "pwc",
    name: "PwC",
    aliases: ["pwc"],
    type: "workday",
    tenant: "pwc",
    site: "Global_Experienced_Careers",
    domain: "pwc.wd3.myworkdayjobs.com",
  };

  it("builds the CXS API URL on the stored Workday host", () => {
    expect(buildWorkdayApiUrl(config)).toBe("https://pwc.wd3.myworkdayjobs.com/wday/cxs/pwc/Global_Experienced_Careers/jobs");
  });

  it("builds the job detail application URL on the stored Workday host", () => {
    expect(buildWorkdayJobUrl(config, "/job/Sydney/2026-Graduate-Program_JR123"))
      .toBe("https://pwc.wd3.myworkdayjobs.com/en-US/Global_Experienced_Careers/job/Sydney/2026-Graduate-Program_JR123");
  });

  /* A host that is not Workday's is refused, whatever a saved row says. */
  it("ignores a stored domain that is not a Workday host", () => {
    expect(buildWorkdayApiUrl({ ...config, domain: "evil.example.com" }))
      .toBe("https://pwc.myworkdayjobs.com/wday/cxs/pwc/Global_Experienced_Careers/jobs");
  });
});

describe("mapWorkdayPosting", () => {
  const config: EmployerPortalConfig = {
    id: "accenture",
    name: "Accenture",
    aliases: ["accenture"],
    type: "workday",
    tenant: "accenture",
    site: "AccentureCareers",
    domain: "accenture.wd103.myworkdayjobs.com",
  };

  it("maps clean Workday JSON to JobSearchResult with direct apply metadata", () => {
    const raw: WorkdayPosting = {
      title: "2026 Technology Graduate Program",
      externalPath: "/job/Sydney-NSW/2026-Technology-Graduate_12345",
      locationsText: "Sydney, New South Wales, Australia",
      postedOn: "Posted 3 Days Ago",
    };

    const mapped = mapWorkdayPosting(raw, config);
    expect(mapped).not.toBeNull();
    expect(mapped?.title).toBe("2026 Technology Graduate Program");
    expect(mapped?.employer).toBe("Accenture");
    expect(mapped?.location).toBe("Sydney, New South Wales, Australia");
    expect(mapped?.source).toBe("Company Careers");
    expect(mapped?.applyDirect).toBe(true);
    expect(mapped?.platforms).toEqual(["Accenture", "Direct Apply"]);
    expect(mapped?.url).toBe("https://accenture.wd103.myworkdayjobs.com/en-US/AccentureCareers/job/Sydney-NSW/2026-Technology-Graduate_12345");
  });

  it("drops malformed postings without title or path", () => {
    expect(mapWorkdayPosting({}, config)).toBeNull();
    expect(mapWorkdayPosting({ title: "Incomplete" }, config)).toBeNull();
  });
});

describe("searchWorkdayPortal", () => {
  const config: EmployerPortalConfig = {
    id: "example",
    name: "Example",
    aliases: ["example"],
    type: "workday",
    tenant: "example",
  };

  it("does not report an HTTP failure as an empty careers site", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(searchWorkdayPortal(config, { employer: "Example", searchText: "Engineer" }))
      .rejects.toThrow("status 503");
  });
});
