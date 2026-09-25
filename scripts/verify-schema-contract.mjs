import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const production = process.env.VERCEL_ENV === "production";
if (!production) {
  console.log("Schema contract: skipped outside Vercel production.");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Schema contract: production build cannot verify Supabase because NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.");
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const checks = [
  {
    label: "search_preferences current Search Brief contract",
    run: () => supabase
      .from("search_preferences")
      .select("user_id,country,countries,employment_types,target_locations,target_companies,experience_level,remote_preference,sources,direct_employers_only")
      .limit(0),
  },
  {
    label: "candidate_context_snapshots Candidate Context persistence",
    run: () => supabase
      .from("candidate_context_snapshots")
      .select("id,user_id,schema_version,source_fingerprint,context,created_at")
      .limit(0),
  },
  {
    label: "candidate_interactions Interaction Memory persistence",
    run: () => supabase
      .from("candidate_interactions")
      .select("id,user_id,job_id,event_type,source,title,employer,location,source_url,metadata,occurred_at")
      .limit(0),
  },
  {
    label: "anonymous_visitors lifecycle telemetry",
    run: () => supabase
      .from("anonymous_visitors")
      .select("visitor_id,first_seen_at,last_seen_at,visit_count,page_view_count,converted_user_id,converted_at")
      .limit(0),
  },
  {
    label: "resume_imports retained-original/master contract",
    run: () => supabase
      .from("resume_imports")
      .select("id,object_path,is_master,status,archived_at")
      .limit(0),
  },
  {
    label: "profiles master résumé contract",
    run: () => supabase
      .from("profiles")
      .select("id,master_resume,master_resume_text,master_resume_updated_at")
      .limit(0),
  },
];

const failures = [];

for (const check of checks) {
  const { error } = await check.run();
  if (error) failures.push({ label: check.label, message: error.message, code: error.code });
}

const rpc = await supabase.rpc("ensure_master_resume_import", { p_import_id: randomUUID() });
if (rpc.error && !["PGRST116"].includes(rpc.error.code ?? "")) {
  failures.push({
    label: "ensure_master_resume_import RPC",
    message: rpc.error.message,
    code: rpc.error.code,
  });
}

if (failures.length) {
  console.error("Schema contract FAILED. Application code is ahead of production Supabase.");
  for (const failure of failures) {
    console.error(`- ${failure.label}: [${failure.code ?? "unknown"}] ${failure.message}`);
  }
  console.error("Apply the required Supabase migrations before allowing this production deployment.");
  process.exit(1);
}

console.log("Schema contract: production Supabase satisfies the application contract.");
