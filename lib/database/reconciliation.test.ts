import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";

const RECONCILIATION = "supabase/reconciliation/20260808_existing_project_reconciliation.sql";
const VERIFICATION = "supabase/reconciliation/20260808_existing_project_verification.sql";

describe("database deployment safety", () => {
  it("has a foundation migration before every altering migration", async () => {
    const files = (await readdir("supabase/migrations"))
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const baseline = await readFile(`supabase/migrations/${files[0]}`, "utf8");

    expect(files[0]).toBe("20260730_initial_schema.sql");
    expect(baseline).toContain("create table if not exists public.profiles");
    expect(baseline).toContain("create table if not exists public.applications");
    expect(baseline).toMatch(/^begin;/);
    expect(baseline.trimEnd()).toMatch(/commit;$/);
  });

  it("keeps the existing-project package out of the automatic migration chain", async () => {
    const migrationFiles = await readdir("supabase/migrations");
    const readme = await readFile("README.md", "utf8");

    expect(migrationFiles).not.toContain("20260808_existing_project_reconciliation.sql");
    expect(readme).toContain("Do not run `supabase db push`");
    expect(readme).toContain(RECONCILIATION);
  });

  it("fails safely before infrastructure changes when the observed schema is absent", async () => {
    const sql = await readFile(RECONCILIATION, "utf8");
    const preflight = sql.indexOf("Sartho reconciliation stopped");

    expect(preflight).toBeGreaterThan(0);
    expect(preflight).toBeLessThan(sql.indexOf("insert into storage.buckets"));
    expect(preflight).toBeLessThan(sql.indexOf("create table if not exists public.ai_usage_events"));
    for (const table of [
      "profiles", "target_lanes", "career_roles", "evidence_items",
      "jobs", "job_requirements", "applications", "resume_imports",
    ]) {
      expect(sql).toContain(`('public.${table}')`);
    }
    expect(sql).toContain("this project already has Supabase migration history");
    expect(sql).toContain("RLS is disabled on");
    expect(sql).toContain("required authenticated-only policies differ");
    expect(sql).toContain("missing required functions");
  });

  it("is transactional, bounded and does not alter migration history", async () => {
    const sql = await readFile(RECONCILIATION, "utf8");

    expect(sql).toMatch(/^begin;/);
    expect(sql.trimEnd()).toMatch(/commit;$/);
    expect(sql).toContain("lock_timeout = '5s'");
    expect(sql).toContain("statement_timeout = '60s'");
    expect(sql).not.toMatch(/\b(insert\s+into|update|delete\s+from)\s+supabase_migrations\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);

    const installation = sql.slice(0, sql.indexOf("create or replace function public.wipe_my_data"));
    expect(installation).not.toMatch(/delete from public\.(profiles|target_lanes|career_roles|evidence_items|jobs|job_requirements|applications|resume_imports)/i);
    expect(installation).not.toMatch(/update public\.(profiles|target_lanes|career_roles|evidence_items|jobs|job_requirements|applications|resume_imports)/i);
  });

  it("adds private owner-scoped uploads and a server-only quota ledger", async () => {
    const sql = await readFile(RECONCILIATION, "utf8");

    expect(sql).toContain("'resume-uploads'");
    expect(sql).toContain("false");
    expect(sql).toContain("8388608");
    expect(sql.match(/storage\.foldername\(name\)/g)).toHaveLength(3);
    expect(sql).toContain("alter table public.ai_usage_events enable row level security");
    expect(sql).toContain("revoke all on table public.ai_usage_events from public, anon, authenticated");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
  });

  it("removes public access from every structured-output persistence RPC", async () => {
    const sql = await readFile(RECONCILIATION, "utf8");

    for (const signature of [
      "replace_job_requirements(uuid,jsonb,jsonb)",
      "save_resume_draft(uuid,text,text,jsonb,jsonb)",
      "apply_resume_import(uuid,jsonb,jsonb)",
    ]) {
      expect(sql).toContain(`revoke all on function public.${signature} from public, anon`);
      expect(sql).toContain(`grant execute on function public.${signature} to authenticated`);
    }
    expect(sql).toContain("alter default privileges in schema public revoke execute on functions from public");
    expect(sql).toContain("revoke all on function public.delete_my_account() from public, anon");
    expect(sql).toContain("grant execute on function public.delete_my_account() to authenticated");
    expect(sql).toContain("revoke all on function public.set_updated_at() from public, anon, authenticated");
    expect(sql).toContain("revoke all on function public.rls_auto_enable() from public, anon, authenticated");
  });

  it("ships a read-only report that verifies the complete live boundary", async () => {
    const sql = await readFile(VERIFICATION, "utf8");

    expect(sql).not.toMatch(/\binsert\s+into\b/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).not.toMatch(/\bdrop\s+(table|policy|function)\b/i);
    expect(sql).not.toMatch(/\bcreate\s+(table|policy|function)\b/i);
    expect(sql).not.toMatch(/\balter\s+(table|function|default)\b/i);
    expect(sql).not.toMatch(/\bgrant\b/i);
    expect(sql).not.toMatch(/\brevoke\b/i);

    for (const check of [
      "RLS enabled on every user table",
      "owner policies are authenticated-only",
      "anonymous role cannot execute application functions",
      "temporary resume bucket is private and bounded",
      "quota ledger is RLS-protected and not directly exposed",
      "legacy project remains outside automatic migration history",
    ]) {
      expect(sql).toContain(check);
    }
  });
});
