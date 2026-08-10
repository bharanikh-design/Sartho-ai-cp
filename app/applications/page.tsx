import { ApplicationLedger } from "@/components/application-ledger";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { getJobs } from "@/lib/data/jobs";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const { supabase, user } = await requireUser();
  const jobs = await getJobs(supabase, user.id);

  return (
    <div className="page-stack">
      <ProductPageHeader
        eyebrow="Recurring workflow · Track and learn"
        title="Applications"
        description="Keep one factual timeline for each opportunity—from decision and résumé version through acknowledgement, interview and outcome. Nothing is submitted without your approval."
        metric={{ value: jobs.length, label: "tracked opportunities" }}
      />

      <ApplicationLedger initialJobs={jobs} />
    </div>
  );
}
