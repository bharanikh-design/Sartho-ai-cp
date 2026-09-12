import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resumeVersionName, saveResumeDraft } from "@/lib/resume/save";
import { emptyContent, type ResumeContent } from "@/lib/resume/content";

const content: ResumeContent = {
  ...emptyContent(),
  template: "classic",
  name: "A",
  summary: "B",
  sections: [{ id: "s0", heading: "WORK", bullets: [{ id: "s0b0", text: "Did a thing.", evidenceIds: ["e1"], edited: false }] }],
};

const args = {
  jobId: "job-1",
  versionName: "Tailored résumé",
  draft: "a draft long enough to be worth saving",
  changeLog: [],
  evidenceIds: ["e1"],
  content,
};

function clientReturning(...results: Array<{ data?: unknown; error?: unknown }>) {
  const rpc = vi.fn();
  for (const result of results) rpc.mockResolvedValueOnce({ data: result.data ?? null, error: result.error ?? null });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

/*
 * Migrations here are run by hand, so the deployed code and the schema
 * disagree for a while in whichever order they land. Saving a résumé must not
 * be what breaks in that window.
 */
describe("saveResumeDraft", () => {
  it("saves the structure when the database has the parameter", async () => {
    const { client, rpc } = clientReturning({ data: "app-1" });
    const result = await saveResumeDraft(client, args);

    expect(result).toEqual({ applicationId: "app-1", error: null, structureStored: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_job_id: "job-1", p_content: content });
  });

  it("still saves the draft when the migration has not been run yet", async () => {
    const { client, rpc } = clientReturning(
      { error: { code: "PGRST202", message: "Could not find the function public.save_resume_draft(...)" } },
      { data: "app-1" },
    );
    const result = await saveResumeDraft(client, args);

    expect(result.applicationId).toBe("app-1");
    expect(result.error).toBeNull();
    /* The caller is told the structure did not land, rather than assuming it did. */
    expect(result.structureStored).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1][1]).not.toHaveProperty("p_content");
  });

  it("recognises the missing overload from the message when no code is set", async () => {
    const { client, rpc } = clientReturning(
      { error: { message: "function public.save_resume_draft(uuid, text, text, jsonb, jsonb, jsonb) does not exist" } },
      { data: "app-2" },
    );
    expect((await saveResumeDraft(client, args)).applicationId).toBe("app-2");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("does not retry a real failure — a permission error is not a missing function", async () => {
    const error = { code: "42501", message: "permission denied for function save_resume_draft" };
    const { client, rpc } = clientReturning({ error });
    const result = await saveResumeDraft(client, args);

    expect(result.error).toBe(error);
    expect(result.applicationId).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("reports the fallback's own failure rather than swallowing it", async () => {
    const fallbackError = { code: "23505", message: "duplicate key" };
    const { client } = clientReturning({ error: { code: "PGRST202" } }, { error: fallbackError });
    const result = await saveResumeDraft(client, args);

    expect(result.error).toBe(fallbackError);
    expect(result.structureStored).toBe(false);
  });
});

/*
 * Every version used to be named "Tailored résumé", or whatever the previous
 * save was called. A repository whose rows all say the same thing is not a
 * repository, it is a pile — and the point of keeping them is being able to
 * find the one written for a particular role on a particular day.
 */
describe("what a saved résumé is called", () => {
  const at = new Date("2026-09-12T12:17:00.000Z");

  it("leads with the role, which is what a person searches by", () => {
    expect(resumeVersionName("ServiceNow Delivery Director", at)).toMatch(/^ServiceNow Delivery Director · /);
  });

  /*
   * The month is matched loosely. Node renders en-GB September as "Sept" and
   * other ICU builds as "Sep"; pinning the spelling tests the platform's
   * locale data rather than this function.
   */
  it("carries the day and the time, so two saves on one day are told apart", () => {
    const name = resumeVersionName("Engagement Manager", at);
    expect(name).toMatch(/12 Sept? 2026/);
    expect(name).toMatch(/\d{2}:\d{2}/);
  });

  it("distinguishes two saves an hour apart", () => {
    const morning = resumeVersionName("Engagement Manager", new Date("2026-09-12T01:00:00.000Z"));
    const evening = resumeVersionName("Engagement Manager", new Date("2026-09-12T13:00:00.000Z"));
    expect(morning).not.toBe(evening);
  });

  it("falls back to something readable when the role is missing", () => {
    expect(resumeVersionName("", at)).toMatch(/^Tailored résumé · /);
    expect(resumeVersionName("   ", at)).toMatch(/^Tailored résumé · /);
  });

  it("trims a role that arrived with whitespace", () => {
    expect(resumeVersionName("  Practice Lead  ", at)).toMatch(/^Practice Lead · /);
  });
});
