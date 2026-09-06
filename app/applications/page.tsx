import { ApplicationLedger } from "@/components/application-ledger";
import { ChromeExtensionBanner } from "@/components/chrome-extension-banner";
import { JobImportBridge } from "@/components/job-import-bridge";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { getJobs } from "@/lib/data/jobs";

export const dynamic = "force-dynamic";

import { constructMetadata } from "@/lib/seo";

export const metadata = constructMetadata("Opportunities", "Track your saved roles and applications.", "/applications");

/*
 * The pipeline, and nothing above it.
 *
 * "Add & analyse a role" used to sit here, between the header and the pipeline,
 * which meant the thing this page exists for was below the fold: somebody could
 * open Opportunities, see a form, and never scroll far enough to learn they had
 * a pipeline at all. Analysing has its own page now, and its own place on the
 * rail, so this one opens straight onto the roles.
 */
export default async function ApplicationsPage() {
  const { supabase, user } = await requireUser();
  const jobs = await getJobs(supabase, user.id);

  return (
    <div className="page-stack">
      <ChromeExtensionBanner />
      {/*
        * Above the header, because a role sent from a job board is the reason
        * this page just opened, and the person needs to see it landed.
        */}
      <JobImportBridge />
      <ProductPageHeader
        eyebrow="Opportunities"
        title="Every role you have kept"
        description="Track each role from decision through interview to outcome."
        metric={{ value: jobs.length, label: "tracked opportunities" }}
        actions={[{ href: "/analyse", label: "Analyse a role", primary: true }]}
      />

      <ApplicationLedger initialJobs={jobs} />
    </div>
  );
}
