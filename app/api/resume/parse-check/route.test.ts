import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyContent, type ResumeContent } from "@/lib/resume/content";

const getAuthenticatedUser = vi.fn();
vi.mock("@/lib/auth", () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }));

const { POST } = await import("./route");

const document: ResumeContent = {
  ...emptyContent(),
  template: "systems",
  name: "Bharani Kumar H",
  contact: { email: "b@example.com", phone: "+44 7000 000000", location: "London", linkedin: "", website: "" },
  summary: "Platform leader.",
  roles: [{ id: "r0", title: "Head of EUC Engineering", employer: "Barclays", location: "", start: "2019", end: "", current: true, bullets: [{ id: "r0b0", text: "Cut major incident volume by 40% across a 60,000 device estate.", evidenceIds: [], edited: false }] }],
  skillGroups: [{ id: "sg0", name: "Platforms", skills: ["Intune", "Kubernetes"] }],
};

function request(parts: Record<string, string | Blob>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(parts)) form.append(key, value);
  return new Request("http://localhost/api/resume/parse-check", { method: "POST", body: form });
}

beforeEach(() => {
  getAuthenticatedUser.mockResolvedValue({ supabase: {}, user: { id: "user-1" } });
});

describe("POST /api/resume/parse-check", () => {
  it("builds the Word file, reads it back, and reports every fact found", async () => {
    const response = await POST(request({ content: JSON.stringify(document) }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.docx.ok).toBe(true);
    expect(body.docx.total).toBeGreaterThan(5);
    expect(body.pdf).toBeNull();
  });

  it("reads a PDF back when one is sent", async () => {
    const React = await import("react");
    const { Document, Page, Text, renderToBuffer } = await import("@react-pdf/renderer");
    const h = React.createElement;
    const lines = ["Bharani Kumar H", "b@example.com · +44 7000 000000", "Head of EUC Engineering, Barclays 2019 – Present", "Cut major incident volume by 40% across a 60,000 device estate.", "Platforms: Intune · Kubernetes"];
    const rendered = await renderToBuffer(h(Document, null, h(Page, { size: "A4", style: { padding: 40, fontSize: 10 } }, ...lines.map((line, i) => h(Text, { key: i }, line)))) as never);
    /* A fresh ArrayBuffer, because a Node Buffer's backing store may be shared and Blob refuses that type. */
    const bytes = new ArrayBuffer(rendered.byteLength);
    new Uint8Array(bytes).set(rendered);
    const pdf = new Blob([bytes], { type: "application/pdf" });

    const response = await POST(request({ content: JSON.stringify(document), pdf }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.pdf.ok).toBe(true);
  });

  it("refuses a request with no document, and an unauthenticated one", async () => {
    expect((await POST(request({}))).status).toBe(400);
    getAuthenticatedUser.mockResolvedValue({ supabase: null, user: null });
    expect((await POST(request({ content: JSON.stringify(document) }))).status).toBe(401);
  });
});
