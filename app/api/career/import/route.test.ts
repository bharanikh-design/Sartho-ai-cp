import { beforeEach, describe, expect, it, vi } from "vitest";
import { readProgressEvents, type ImportEvent } from "@/lib/resume/progress-stream";

/*
 * The import route, run for real.
 *
 * Only the two things this sandbox genuinely cannot reach are replaced — the
 * database and the model. Everything between them is the shipping code: the
 * multipart parse, the text extraction, the normalisation, the streaming
 * response, and then the client's own parser reading that stream back. That
 * seam — server writes ndjson, client reassembles it off arbitrary chunk
 * boundaries — is the part no unit test on either side would have caught, and
 * it is exactly where a working feature turns into a page that sits dead.
 */

const generateStructuredJson = vi.fn();
const getAuthenticatedUser = vi.fn();

vi.mock("@/lib/ai/provider", () => ({
  generateStructuredJson: (...args: unknown[]) => generateStructuredJson(...args),
}));
vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: () => getAuthenticatedUser(),
}));

const { POST } = await import("./route");

const EXTRACTION = {
  roles: [
    {
      employer: "Barclays", title: "Head of EUC", location: "London",
      startDate: "2019-01", endDate: null, isCurrent: true, summary: null,
    },
  ],
  evidence: [
    {
      employer: "Barclays", title: "Head of EUC",
      claim: "Cut major incident volume by 40% across a 60,000 device estate",
      context: null, periodLabel: "2019 — Present",
      metrics: ["40%"], domains: ["ITSM"], confidence: "high" as const,
    },
    {
      employer: "Barclays", title: "Head of EUC",
      claim: "Migrated 42,000 endpoints to Windows 11 across eleven countries",
      context: null, periodLabel: "2019 — Present",
      metrics: ["42,000"], domains: ["Endpoint"], confidence: "high" as const,
    },
  ],
  headline: "Head of End User Computing",
  summary: "Twenty years in service transformation.",
  location: "London",
  totalExperienceYears: 20,
};

/* A résumé long enough to clear the minimum-useful-text guard. */
const RESUME = [
  "BHARANI KUMAR H — Head of End User Computing, London",
  "",
  "BARCLAYS — Head of EUC Engineering, 2019 to present",
  "Cut major incident volume by 40% across a 60,000 device estate.",
  "Migrated 42,000 endpoints to Windows 11 across eleven countries.",
  "Ran a four million pound managed service contract through to renewal.",
  "Rebuilt the joiner, mover and leaver pipeline end to end.",
  "",
  "HSBC — Service Transition Lead, 2015 to 2019",
  "Consolidated four regional service desks into one follow-the-sun operation.",
  "Supported ninety thousand users across a global estate every single day.",
  "Held the transition gate for every release into the production estate.",
].join("\n");

type Recorded = { rpc: Record<string, unknown> | null; updates: Array<Record<string, unknown>> };

function fakeSupabase(recorded: Recorded, opts: { importInsertFails?: boolean } = {}) {
  /* .eq() has to be both awaitable and chainable — the code uses one and two. */
  const terminal = (onCall: () => void): Record<string, unknown> => ({
    eq: () => terminal(onCall),
    then: (resolve: (value: { data: null; error: null }) => void) => {
      onCall();
      resolve({ data: null, error: null });
    },
  });

  return {
    from(table: string) {
      return {
        insert: () => ({
          select: () => ({
            single: async () =>
              opts.importInsertFails
                ? { data: null, error: { message: "insert refused" } }
                : { data: { id: "import-1" }, error: null },
          }),
        }),
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: "user-1", headline: null, summary: null, location: null, total_experience_years: null } }) }),
        }),
        update: (patch: Record<string, unknown>) =>
          terminal(() => recorded.updates.push({ table, ...patch })),
      };
    },
    rpc: async (_name: string, args: Record<string, unknown>) => {
      recorded.rpc = args;
      return { data: { rolesCreated: 1, evidenceCreated: 2, evidenceSkipped: 0 }, error: null };
    },
  };
}

function upload(text = RESUME, name = "CV.txt") {
  const form = new FormData();
  form.append("file", new File([text], name, { type: "text/plain" }));
  return new Request("http://localhost/api/career/import", { method: "POST", body: form });
}

/* Reads the response exactly as the browser client does. */
async function drain(response: Response) {
  const seen: ImportEvent[] = [];
  await readProgressEvents(response.body!, (event) => seen.push(event));
  return seen;
}

let recorded: Recorded;

beforeEach(() => {
  vi.clearAllMocks();
  recorded = { rpc: null, updates: [] };
  getAuthenticatedUser.mockResolvedValue({ supabase: fakeSupabase(recorded), user: { id: "user-1" } });
  generateStructuredJson.mockResolvedValue(EXTRACTION);
});

describe("POST /api/career/import", () => {
  it("streams the stages in order and finishes with the counts", async () => {
    const response = await POST(upload());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("ndjson");

    const seen = await drain(response);
    expect(seen.map((e) => e.stage)).toEqual(["extracted", "reading", "saving", "done"]);

    const done = seen.at(-1)!;
    expect(done).toMatchObject({ stage: "done", rolesCreated: 1, evidenceCreated: 2, evidenceSkipped: 0 });
  });

  it("reports the real character count and a sample of the real document", async () => {
    const seen = await drain(await POST(upload()));
    const extracted = seen.find((e) => e.stage === "extracted");

    expect(extracted).toBeDefined();
    if (extracted?.stage !== "extracted") throw new Error("unreachable");
    /*
     * The count is of the text as extracted, not of the bytes uploaded —
     * extraction collapses whitespace, so the two differ and the one worth
     * showing is what was actually read.
     */
    expect(extracted.characters).toBeGreaterThan(400);
    expect(extracted.characters).toBe(extracted.sample.length);
    expect(extracted.sample).toContain("BARCLAYS");
  });

  it("counts what the model found before it is written, not after", async () => {
    const seen = await drain(await POST(upload()));
    const saving = seen.find((e) => e.stage === "saving");

    if (saving?.stage !== "saving") throw new Error("expected a saving stage");
    expect(saving).toMatchObject({ roles: 1, claims: 2 });
  });

  /*
   * The route cannot ask for a claim to be approved, because it has no way to
   * express one. Approval status is not in the payload at all — apply_resume_import
   * writes 'pending' itself, so no caller, including a compromised one, can put
   * an unreviewed claim into circulation. The next test holds the SQL to that.
   */
  it("sends no approval status of its own", async () => {
    await drain(await POST(upload()));
    const evidence = (recorded.rpc?.p_evidence ?? []) as Array<Record<string, unknown>>;

    expect(evidence).toHaveLength(2);
    for (const claim of evidence) expect(claim).not.toHaveProperty("approval_status");
  });

  it("turns a provider failure into an error event rather than a dead stream", async () => {
    generateStructuredJson.mockRejectedValue(new Error("Sartho's AI provider has run out of credit."));

    const response = await POST(upload());
    expect(response.status).toBe(200);

    const seen = await drain(response);
    expect(seen.map((e) => e.stage)).toEqual(["extracted", "reading", "error"]);
    const failure = seen.at(-1)!;
    if (failure.stage !== "error") throw new Error("unreachable");
    expect(failure.error).toContain("run out of credit");
  });

  it("marks the import row failed when the provider fails", async () => {
    generateStructuredJson.mockRejectedValue(new Error("boom"));
    await drain(await POST(upload()));

    expect(recorded.updates).toContainEqual(
      expect.objectContaining({ table: "resume_imports", status: "failed", error: "boom" }),
    );
  });

  it("says so plainly when the document holds no career evidence", async () => {
    generateStructuredJson.mockResolvedValue({ ...EXTRACTION, evidence: [] });

    const seen = await drain(await POST(upload()));
    const failure = seen.at(-1)!;
    if (failure.stage !== "error") throw new Error("expected an error stage");
    expect(failure.error).toContain("did not find any career evidence");
  });

  it("refuses an unauthenticated request with a status code, not a stream", async () => {
    getAuthenticatedUser.mockResolvedValue({ supabase: null, user: null });

    const response = await POST(upload());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("refuses a request with no file attached", async () => {
    const response = await POST(new Request("http://localhost/api/career/import", {
      method: "POST",
      body: new FormData(),
    }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain("Choose a résumé file");
  });

  it("refuses a document with too little text to be a résumé", async () => {
    const response = await POST(upload("Bharani", "empty.txt"));
    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  });

  it("does not reach the model when the import row cannot be created", async () => {
    getAuthenticatedUser.mockResolvedValue({
      supabase: fakeSupabase(recorded, { importInsertFails: true }),
      user: { id: "user-1" },
    });

    const response = await POST(upload());
    expect(response.status).toBe(400);
    expect(generateStructuredJson).not.toHaveBeenCalled();
  });

  it("fills a blank profile from the document without overwriting anything set", async () => {
    await drain(await POST(upload()));
    expect(recorded.updates).toContainEqual(
      expect.objectContaining({ table: "profiles", headline: "Head of End User Computing" }),
    );
  });

  it("has a migration that hard-codes every imported claim to pending", async () => {
    const { readFile } = await import("node:fs/promises");
    const sql = await readFile("supabase/migrations/20260804_resume_import.sql", "utf8");

    const insert = sql.slice(sql.indexOf("insert into public.evidence_items"));
    const columns = insert.slice(0, insert.indexOf(")"));
    const values = insert.slice(insert.indexOf("select"), insert.indexOf("from incoming"));

    expect(columns).toContain("approval_status");
    expect(values).toContain("'pending'");
    expect(values).not.toContain("'approved'");
  });
});
