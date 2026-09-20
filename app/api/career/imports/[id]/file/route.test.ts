import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The original file, handed back unchanged.
 */

const getAuthenticatedUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }));

const { GET } = await import("./route");

const ID = "0f7f3f1e-2b4a-4c8d-9e1f-3a5b7c9d1e2f";
const OBJECT_PATH = "user-1/00000000-0000-4000-8000-000000000001.docx";
const BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01, 0x02, 0x03]);

function fakeSupabase(opts: { row?: Record<string, unknown> | null; downloads?: string[] } = {}) {
  const row = opts.row === undefined
    ? { file_name: "My Résumé (2026).docx", mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", object_path: OBJECT_PATH }
    : opts.row;
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
  return {
    from: () => chain,
    storage: {
      from: () => ({
        download: async (path: string) => {
          opts.downloads?.push(path);
          return { data: new Blob([BYTES], { type: "application/octet-stream" }), error: null };
        },
      }),
    },
  };
}

const params = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  getAuthenticatedUser.mockResolvedValue({ supabase: fakeSupabase(), user: { id: "user-1" } });
});

describe("GET /api/career/imports/[id]/file", () => {
  it("streams the object byte for byte under its uploaded name and type", async () => {
    const downloads: string[] = [];
    getAuthenticatedUser.mockResolvedValue({ supabase: fakeSupabase({ downloads }), user: { id: "user-1" } });

    const response = await GET(new Request("http://localhost"), params());

    expect(response.status).toBe(200);
    expect(downloads).toEqual([OBJECT_PATH]);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES);
    expect(response.headers.get("Content-Type")).toContain("wordprocessingml");
    expect(response.headers.get("Content-Length")).toBe(String(BYTES.byteLength));
    const disposition = response.headers.get("Content-Disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toContain(encodeURIComponent("My Résumé (2026).docx"));
  });

  it("says so when the row predates kept originals", async () => {
    getAuthenticatedUser.mockResolvedValue({
      supabase: fakeSupabase({ row: { file_name: "old.pdf", mime_type: "application/pdf", object_path: null } }),
      user: { id: "user-1" },
    });
    const response = await GET(new Request("http://localhost"), params());
    expect(response.status).toBe(404);
    expect((await response.json()).error).toContain("not kept");
  });

  it("refuses an object path that is not the person's own, even from their row", async () => {
    getAuthenticatedUser.mockResolvedValue({
      supabase: fakeSupabase({ row: { file_name: "x.pdf", mime_type: null, object_path: "user-2/00000000-0000-4000-8000-000000000001.pdf" } }),
      user: { id: "user-1" },
    });
    const response = await GET(new Request("http://localhost"), params());
    expect(response.status).toBe(403);
  });

  it("answers 404 for an id that is not a uuid", async () => {
    const response = await GET(new Request("http://localhost"), params("not-a-uuid"));
    expect(response.status).toBe(404);
  });
});
