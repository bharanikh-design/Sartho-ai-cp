import { describe, expect, it } from "vitest";
import { employerKey, findEmployerPortal } from "./registry";
import { loadEmployerCareerSources, saveEmployerCareerSource } from "./saved-sources";
import type { EmployerPortalConfig } from "./types";

const saved: EmployerPortalConfig = {
  id: "atkinsrealis",
  name: "AtkinsRéalis",
  aliases: ["AtkinsRéalis"],
  type: "workday",
  tenant: "atkinsrealis",
  site: "Careers",
};

describe("employerKey", () => {
  it("ignores punctuation, casing and spacing", () => {
    expect(employerKey("AtkinsRéalis")).toBe(employerKey("atkins realis"));
    expect(employerKey("  PwC  ")).toBe("pwc");
    expect(employerKey("Ernst & Young")).toBe("ernstyoung");
    expect(employerKey("   ")).toBe("");
  });
});

describe("findEmployerPortal", () => {
  it("still finds the hardcoded companies", () => {
    expect(findEmployerPortal("Deloitte")?.tenant).toBe("deloitte");
    expect(findEmployerPortal("ernst and young")?.id).toBe("ey");
    expect(findEmployerPortal("nobody")).toBeNull();
    expect(findEmployerPortal("")).toBeNull();
  });

  /*
   * The reported failure: somebody verifies their employer's careers page,
   * sees "✓ Connected", and the search reports that employer as unknown
   * because it only ever consulted the nine companies in registry.ts.
   */
  it("finds an employer the person verified themselves", () => {
    expect(findEmployerPortal("AtkinsRéalis")).toBeNull();
    expect(findEmployerPortal("AtkinsRéalis", [saved])?.tenant).toBe("atkinsrealis");
  });

  /* Their own tenant beats our guess at the same company's name. */
  it("prefers a saved source over the hardcoded one", () => {
    const theirs: EmployerPortalConfig = { ...saved, id: "deloitte", name: "Deloitte", aliases: ["Deloitte"], tenant: "deloitte-anz" };
    expect(findEmployerPortal("Deloitte", [theirs])?.tenant).toBe("deloitte-anz");
  });
});

/* A fake PostgREST chain: enough to answer one select or one upsert. */
function client(behaviour: { rows?: unknown[]; error?: unknown; throws?: boolean }) {
  return {
    from() {
      if (behaviour.throws) throw new Error("no such table");
      return {
        select: () => ({ eq: async () => ({ data: behaviour.rows ?? null, error: behaviour.error ?? null }) }),
        upsert: async () => ({ error: behaviour.error ?? null }),
      };
    },
  } as never;
}

describe("loadEmployerCareerSources", () => {
  it("reads back the sources that are usable", async () => {
    const rows = [
      { employer: "AtkinsRéalis", config: saved },
      { employer: "Broken", config: { type: "workday" } },          // no tenant
      { employer: "Alien", config: { type: "taleo", tenant: "x" } }, // unsupported ATS
      { employer: "Nothing", config: null },
    ];
    const loaded = await loadEmployerCareerSources(client({ rows }), "user-1");
    expect(loaded).toHaveLength(1);
    expect(loaded[0].tenant).toBe("atkinsrealis");
  });

  /*
   * None of this may fail a search. A missing table or a dropped connection
   * means "no saved sources", which is exactly how the product behaved before
   * they existed.
   */
  it("never throws, whatever the database does", async () => {
    await expect(loadEmployerCareerSources(client({ throws: true }), "u")).resolves.toEqual([]);
    await expect(loadEmployerCareerSources(client({ error: { code: "42P01" } }), "u")).resolves.toEqual([]);
    await expect(loadEmployerCareerSources(client({ rows: [] }), "u")).resolves.toEqual([]);
  });
});

describe("saveEmployerCareerSource", () => {
  const source = { employer: "AtkinsRéalis", config: saved, careersUrl: "https://x.wd3.myworkdayjobs.com/Careers", verifiedAt: null, jobsFound: 5 };

  it("reports whether it was kept, so the screen can only promise what happened", async () => {
    await expect(saveEmployerCareerSource(client({}), "u", source)).resolves.toBe(true);
    await expect(saveEmployerCareerSource(client({ error: { code: "23505" } }), "u", source)).resolves.toBe(false);
    await expect(saveEmployerCareerSource(client({ throws: true }), "u", source)).resolves.toBe(false);
  });

  it("refuses an employer with no name to key on", async () => {
    await expect(saveEmployerCareerSource(client({}), "u", { ...source, employer: "  " })).resolves.toBe(false);
  });
});
