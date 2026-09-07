import { IntegrationCard } from "@/components/integration-card";
import { ProductPageHeader } from "@/components/product-page-header";
import { requireUser } from "@/lib/auth";
import { isGoogleConfigured } from "@/lib/integrations/google";
import { connectionStatus } from "@/lib/integrations/store";

export const dynamic = "force-dynamic";

/*
 * What Sartho is connected to, and how to stop it.
 *
 * Worth its own page even with one connector on it. A product whose argument
 * is that it does not act behind your back needs somewhere that shows exactly
 * what it can reach and takes it away in one click — otherwise "read-only, only
 * when you ask" is a sentence in a marketing page rather than something anybody
 * can check.
 *
 * The query string is read here rather than in a client component because it
 * is written by the OAuth callback, and the answer has to be on the page the
 * redirect lands on rather than one render later.
 */
export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; cancelled?: string; error?: string }>;
}) {
  const { user } = await requireUser();
  const [status, params] = await Promise.all([connectionStatus(user.id), searchParams]);

  /*
   * Each message names what happened and what to do about it. "Something went
   * wrong" after an OAuth redirect is the least useful sentence in software:
   * the person has just left the site, come back, and has no idea whether they
   * are connected.
   */
  const notice =
    params.connected ? { text: "Google Drive is connected. Sartho can now look for your résumé when you ask it to.", bad: false }
    : params.cancelled ? { text: "No problem — nothing was connected.", bad: false }
    : params.error === "not_configured" ? { text: "Google isn't set up on this deployment yet.", bad: true }
    : params.error === "no_drive" ? { text: "Connected, but Drive access was not granted. Connect again with the Drive permission ticked.", bad: true }
    : params.error === "invalid" ? { text: "That sign-in link had expired or did not match this account. Try connecting again.", bad: true }
    : params.error ? { text: "Google could not complete the connection. Try again.", bad: true }
    : null;

  return (
    <div className="page-stack product-page">
      <ProductPageHeader
        eyebrow="Integrations"
        title="What Sartho is connected to."
        description="Nothing is connected until you connect it, everything is read-only, and Sartho only looks when you ask it to."
      />

      {notice ? (
        <p className={`integration-notice${notice.bad ? " is-bad" : ""}`} role="status">{notice.text}</p>
      ) : null}

      <IntegrationCard
        name="Google Drive"
        purpose="Finds the résumés in your Drive and shows when each was last edited, so you can work from the current one instead of hunting for it."
        connected={status.connected}
        accountEmail={status.accountEmail}
        connectedAt={status.connectedAt}
        driveGranted={status.driveGranted}
        configured={isGoogleConfigured()}
      />
    </div>
  );
}
