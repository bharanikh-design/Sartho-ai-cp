import Link from "next/link";
import { JobAnalyser } from "@/components/job-analyser";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { getJobs } from "@/lib/data/jobs";
import { constructMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = constructMetadata(
  "Analyse a Role",
  "Paste any job advert and see how it reads against your approved career evidence.",
  "/analyse",
);

/*
 * Analysing a role, on its own page.
 *
 * It used to sit as a card at the top of Opportunities, which had two costs.
 * It put a form nobody had asked for above the list everybody came to read —
 * the pipeline was below the fold, so somebody could open Opportunities and
 * never learn they had one. And it hid a complete, self-contained thing inside
 * a page about something else: paste an advert, see whether your evidence
 * supports it. That needs a résumé and nothing else, and it is the fastest way
 * to show somebody what Sartho is for.
 */
export default async function AnalyseRolePage() {
  const { supabase, user } = await requireUser();
  /*
   * Only the pipeline count is read here now. The career workspace was also
   * fetched, purely to build a skill profile that was handed to JobAnalyser and
   * never touched — a database round trip and a profile computation on every
   * load of this page, for a prop nothing read.
   */
  const jobs = await getJobs(supabase, user.id);

  return (
    <div className="page-stack product-page">
      <ProductPageHeader
        eyebrow="Analyse"
        title="Does this role fit your evidence?"
        description="Paste any advert — from LinkedIn, a careers page, or an email — and Sartho maps its requirements against the career evidence you approved, then saves it to your pipeline."
        metric={{ value: jobs.length, label: "in your pipeline", href: "/applications" }}
      />

      {/*
        * The list of saved roles is deliberately not repeated here. It has one
        * home, and two places showing the same rows is how they drift.
        */}
      <JobAnalyser initialJobs={[]} />

      <p className="section-subtitle" style={{ textAlign: "center" }}>
        Everything you save appears in <Link href="/applications" className="direction-inline-link">Opportunities</Link>,
        where you track it from decision through interview to outcome.
      </p>
    </div>
  );
}
