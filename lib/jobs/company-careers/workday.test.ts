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
    expect(findEmployerPortal("Deloitte")?.id).toBe("deloitte");
    expect(findEmployerPortal("Deloitte Consulting")?.id).toBe("deloitte");
    expect(findEmployerPortal("KPMG")?.id).toBe("kpmg");
    expect(findEmployerPortal("Ernst & Young")?.id).toBe("ey");
    expect(findEmployerPortal("EY")?.id).toBe("ey");
    expect(findEmployerPortal("Accenture")?.id).toBe("accenture");
    expect(findEmployerPortal("Canva")?.id).toBe("canva");
  });

  it("returns null for unknown employers", () => {
    expect(findEmployerPortal("Unknown Boutique Ltd")).toBeNull();
  });
});

describe("Workday URL builders", () => {
  const config: EmployerPortalConfig = {
    id: "pwc",
    name: "PwC",
    aliases: ["pwc"],
    type: "workday",
    tenant: "pwc",
    site: "Campus_Careers",
  };

  it("builds the CXS API URL correctly", () => {
    expect(buildWorkdayApiUrl(config)).toBe("https://pwc.myworkdayjobs.com/wday/cxs/pwc/Campus_Careers/jobs");
  });

  it("builds the job detail application URL correctly", () => {
    expect(buildWorkdayJobUrl(config, "/job/Sydney/2026-Graduate-Program_JR123"))
      .toBe("https://pwc.myworkdayjobs.com/en-US/Campus_Careers/job/Sydney/2026-Graduate-Program_JR123");
  });
});

describe("mapWorkdayPosting", () => {
  const config: EmployerPortalConfig = {
    id: "deloitte",
    name: "Deloitte",
    aliases: ["deloitte"],
    type: "workday",
    tenant: "deloitte",
    site: "Deloitte_Careers",
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
    expect(mapped?.employer).toBe("Deloitte");
    expect(mapped?.location).toBe("Sydney, New South Wales, Australia");
    expect(mapped?.source).toBe("Company Careers");
    expect(mapped?.applyDirect).toBe(true);
    expect(mapped?.platforms).toEqual(["Deloitte", "Direct Apply"]);
    expect(mapped?.url).toContain("https://deloitte.myworkdayjobs.com/en-US/Deloitte_Careers/job/Sydney-NSW/2026-Technology-Graduate_12345");
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
