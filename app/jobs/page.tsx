import { redirect } from "next/navigation";

/*
 * Opportunities has been folded into Applications — adding and analysing a role
 * now happens there. This route is kept only so old links land in the right
 * place; the saved-role detail pages at /jobs/[id] are unaffected.
 */
export default function JobsPage() {
  redirect("/applications#add-role");
}
