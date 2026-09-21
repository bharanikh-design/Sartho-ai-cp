import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Opening an upload in the editor: the text goes to the model with the copy
 * rules, the result is saved as the master with the upload's id on it, and
 * the upload row itself is never written to.
 */

const generateStructuredJson = vi.fn();
const getAuthenticatedUser = vi.fn();
vi.mock("@/lib/ai/provider", () => ({
  createSafetyIdentifier: (userId: string) => `test-safety-${userId}`,
  generateStructuredJson: (...args: unknown[]) => generateStructuredJson(...args),
}));
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }));

const { POST } = await import("./route");

const IMPORT_ID = "0f7f3f1e-2b4a-4c8d-9e1f-3a5b7c9d1e2f";
const RAW = "BHARANI KUMAR H\nHead of EUC\n\n• Cut major incident volume by 40% across a 60,000 device estate.\n";

const LAYOUT = {
  name: "BHARANI KUMAR H", targetRole: "Head of EUC",
  contact: { email: "", phone: "", location: "", linkedin: "", website: "" },
  summary: "",
  roles: [{ title: "Head of EUC", employer: "Barclays", location: "", start: "2019", end: "Present", current: true, bullets: ["Cut major incident volume by 40% across a 60,000 device estate."] }],
  sections: [], skills: [], education: [],
};

type Recorded = { updates: Array<{ table: string; patch: Record<string, unknown> }>; rpc: string[] };

function fakeSupabase(recorded: Recorded, opts: { row?: Record<string, unknown> | null; quotaAllowed?: boolean } = {}) {
  const row = opts.row === undefined ? { id: IMPORT_ID, file_name: "CV.pdf", extracted_text: RAW } : opts.row;
  return {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: row, error: null }),
        update: (patch: Record<string, unknown>) => ({ eq: async () => { recorded.updates.push({ table, patch }); return { error: null }; } }),
      };
      return chain;
    },
    rpc: async (name: string) => {
      recorded.rpc.push(name);
      return { data: { allowed: opts.quotaAllowed ?? true, reason: opts.quotaAllowed === false ? "rate_limit" : null, retryAfterSeconds: 30, remainingMonthlyUnits: 5 }, error: null };
    },
  };
}

const request = (body: unknown) =>
  new Request("http://localhost/api/resume/master/from-upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

let recorded: Recorded;

beforeEach(() => {
  vi.clearAllMocks();
  recorded = { updates: [], rpc: [] };
  getAuthenticatedUser.mockResolvedValue({ supabase: fakeSupabase(recorded), user: { id: "user-1", email: "signin@example.com" } });
  generateStructuredJson.mockResolvedValue(LAYOUT);
});

describe("POST /api/resume/master/from-upload", () => {
  it("lays the upload out verbatim and saves it as the master, marked with the upload", async () => {
    const response = await POST(request({ importId: IMPORT_ID }));
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.fileName).toBe("CV.pdf");
    expect(body.content.sourceImportId).toBe(IMPORT_ID);
    expect(body.content.roles[0].bullets[0].text).toBe("Cut major incident volume by 40% across a 60,000 device estate.");
    expect(body.content.contact.email).toBe("signin@example.com");
    expect(body.placed.total).toBeGreaterThan(10);
    expect(body.placed.placed).toBe(body.placed.total);

    const call = generateStructuredJson.mock.calls[0][0];
    expect(call.schemaName).toBe("sartho_resume_layout");
    expect(call.system).toContain("word for word");
    expect(JSON.parse(call.prompt).resumeText).toBe(RAW);

    const saved = recorded.updates.find((entry) => entry.table === "profiles");
    expect(saved?.patch.master_resume).toMatchObject({ sourceImportId: IMPORT_ID });
    expect(saved?.patch.master_resume_text).toContain("Cut major incident volume");
    expect(recorded.updates.some((entry) => entry.table === "resume_imports")).toBe(false);
  });

  it("refuses without an upload id", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(400);
    expect(generateStructuredJson).not.toHaveBeenCalled();
  });

  it("answers 404 when the upload is not the person's or has no text", async () => {
    getAuthenticatedUser.mockResolvedValue({ supabase: fakeSupabase(recorded, { row: null }), user: { id: "user-1" } });
    const response = await POST(request({ importId: IMPORT_ID }));
    expect(response.status).toBe(404);
    expect(generateStructuredJson).not.toHaveBeenCalled();
  });

  it("stops at the allowance before reaching the model", async () => {
    getAuthenticatedUser.mockResolvedValue({ supabase: fakeSupabase(recorded, { quotaAllowed: false }), user: { id: "user-1" } });
    const response = await POST(request({ importId: IMPORT_ID }));
    expect(response.status).toBe(429);
    expect(generateStructuredJson).not.toHaveBeenCalled();
  });

  it("keeps the current master when the model fails", async () => {
    generateStructuredJson.mockRejectedValue(new Error("provider down"));
    const response = await POST(request({ importId: IMPORT_ID }));
    expect(response.status).toBe(500);
    expect(recorded.updates).toEqual([]);
  });

  it("refuses an unauthenticated request", async () => {
    getAuthenticatedUser.mockResolvedValue({ supabase: null, user: null });
    const response = await POST(request({ importId: IMPORT_ID }));
    expect(response.status).toBe(401);
  });
});
