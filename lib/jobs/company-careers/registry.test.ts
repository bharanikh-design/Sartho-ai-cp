import { describe, expect, it } from "vitest";
import { EMPLOYER_PORTALS, findEmployerPortal } from "./registry";
import { buildWorkdayApiUrl } from "./workday";

/*
 * The registry once listed seven Workday employers with no host, and every
 * one of them built "<tenant>.myworkdayjobs.com", which does not exist: a
 * brief naming PwC logged a DNS failure on each search and the person saw
 * nothing from the portal. A Workday entry without its data-centre host is a
 * dead entry, and this is where that is refused.
 */
describe("EMPLOYER_PORTALS", () => {
  const WORKDAY_HOST = /^[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com$/;

  it("gives every Workday employer its real data-centre host", () => {
    const workday = EMPLOYER_PORTALS.filter((portal) => portal.type === "workday");
    expect(workday.length).toBeGreaterThan(0);
    for (const portal of workday) {
      expect(portal.domain, `${portal.id} has no Workday host`).toMatch(WORKDAY_HOST);
      expect(portal.domain, `${portal.id} host does not belong to its tenant`).toMatch(new RegExp(`^${portal.tenant}\\.`));
      expect(buildWorkdayApiUrl(portal).startsWith(`https://${portal.domain}/wday/cxs/${portal.tenant}/`), portal.id).toBe(true);
    }
  });

  it("points the three Workday employers at the sites their postings are published on", () => {
    expect(buildWorkdayApiUrl(findEmployerPortal("PwC")!))
      .toBe("https://pwc.wd3.myworkdayjobs.com/wday/cxs/pwc/Global_Experienced_Careers/jobs");
    expect(buildWorkdayApiUrl(findEmployerPortal("Accenture")!))
      .toBe("https://accenture.wd103.myworkdayjobs.com/wday/cxs/accenture/AccentureCareers/jobs");
    expect(buildWorkdayApiUrl(findEmployerPortal("CommBank")!))
      .toBe("https://cba.wd3.myworkdayjobs.com/wday/cxs/cba/CommBank_Careers/jobs");
  });

  it("has no two entries answering to the same name", () => {
    const claimedBy = new Map<string, string>();
    for (const portal of EMPLOYER_PORTALS) {
      const keys = new Set([portal.id, portal.name, ...portal.aliases].map((key) => key.toLowerCase().replace(/[^a-z0-9]/g, "")));
      for (const key of keys) {
        expect(claimedBy.get(key), `${key} is claimed by both ${claimedBy.get(key)} and ${portal.id}`).toBeUndefined();
        claimedBy.set(key, portal.id);
      }
    }
  });
});
