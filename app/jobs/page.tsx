import { redirect } from "next/navigation";

/*
 * An old route kept alive for old links. The saved-role detail pages at
 * /jobs/[id] are a different thing and are unaffected.
 *
 * It used to send people to /applications#add-role. That anchor was the
 * "Add & analyse a role" card, which moved to its own page — so the link had
 * been landing on Opportunities and scrolling nowhere. Opportunities is the
 * right destination regardless: what /jobs listed is what that page shows.
 */
export default function JobsPage() {
  redirect("/applications");
}
