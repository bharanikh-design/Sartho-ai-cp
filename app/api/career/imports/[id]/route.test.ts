import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * One uploaded résumé, read back and flagged.
 *
 * The one thing that matters here is fidelity: what GET returns is the stored
 * column verbatim. A route that trimmed, collapsed or capped the text on the
 * way out would undo the point of storing it as read.
 */

const getAuthenticatedUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }));

const { GET, PATCH } = await import("./route");

const ID = "0f7f3f1e-2b4a-4c8d-9e1f-3a5b7c9d1e2f";
const STORED = "BHARANI  KUMAR\t\tH\n\n\n\nHead of EUC   ·   London\n  indented line  \n";

type Recorded = { rpcCalls: Array<{ name: string; args: Record<string, unknown> }>; filters: Array<[string, unknown]> };

function fakeSupabase(recorded: Recorded, opts: { row?: Record<string, unknown> | null; rpcError?: { code?: string; message?: string } } = {}) {
  const row = opts.row === undefined
    ? { id: ID, file_name: "CV.docx", extracted_text: STORED, character_count: STORED.length }
    : opts.row;
  const chain = {
    select: () => chain,
    eq: (column: string, value: unknown) => { recorded.filters.push([column, value]); return chain; },
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return {
    from: () => chain,
    rpc: async (name: string, args: Record<string, unknown>) => {
      recorded.rpcCalls.push({ name, args });
      return { data: null, error: opts.rpcError ?? null };
    },
  };
}

const params = (id = ID) => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown) =>
  new Request(`http://localhost/api/career/imports/${ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

let recorded: Recorded;

beforeEach(() => {
  recorded = { rpcCalls: [], filters: [] };
  getAuthenticatedUser.mockResolvedValue({ supabase: fakeSupabase(recorded), user: { id: "user-1" } });
});

describe("GET /api/career/imports/[id]", () => {
  it("returns the stored text verbatim, scoped to the signed-in person", async () => {
    const response = await GET(new Request("http://localhost"), params());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.text).toBe(STORED);
    expect(body.returnedCharacters).toBe(STORED.length);
    expect(body.characterCount).toBe(STORED.length);
    expect(recorded.filters).toContainEqual(["user_id", "user-1"]);
    expect(recorded.filters).toContainEqual(["id", ID]);
  });

  it("answers 404 for an id that is not a uuid, without a query", async () => {
    const response = await GET(new Request("http://localhost"), params("../etc/passwd"));
    expect(response.status).toBe(404);
    expect(recorded.filters).toEqual([]);
  });

  it("answers 404 when the row is not the person's", async () => {
    getAuthenticatedUser.mockResolvedValue({ supabase: fakeSupabase(recorded, { row: null }), user: { id: "user-1" } });
    const response = await GET(new Request("http://localhost"), params());
    expect(response.status).toBe(404);
  });

  it("refuses an unauthenticated request", async () => {
    getAuthenticatedUser.mockResolvedValue({ supabase: null, user: null });
    const response = await GET(new Request("http://localhost"), params());
    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/career/imports/[id]", () => {
  it("marks the résumé as the master through the one function that keeps it unique", async () => {
    const response = await PATCH(patch({ isMaster: true }), params());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, id: ID, isMaster: true });
    expect(recorded.rpcCalls).toEqual([{ name: "set_master_resume_import", args: { p_import_id: ID } }]);
  });

  it("does not offer un-mastering: the way to change the master is to pick another", async () => {
    const response = await PATCH(patch({ isMaster: false }), params());
    expect(response.status).toBe(400);
    expect(recorded.rpcCalls).toEqual([]);
  });

  it("says which migration is missing when the function is not there", async () => {
    getAuthenticatedUser.mockResolvedValue({
      supabase: fakeSupabase(recorded, { rpcError: { code: "PGRST202", message: "Could not find the function" } }),
      user: { id: "user-1" },
    });
    const response = await PATCH(patch({ isMaster: true }), params());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("20260920090000_resume_upload_originals");
  });

  it("answers 404 when the function says the résumé is not the person's", async () => {
    getAuthenticatedUser.mockResolvedValue({
      supabase: fakeSupabase(recorded, { rpcError: { message: "Résumé not found or access denied" } }),
      user: { id: "user-1" },
    });
    const response = await PATCH(patch({ isMaster: true }), params());
    expect(response.status).toBe(404);
  });
});
