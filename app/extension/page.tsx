import { ProductPageHeader } from "@/components/product-page-header";
import { constructMetadata } from "@/lib/seo";
import { EXTENSION_DOWNLOAD_PATH, EXTENSION_VERSION } from "@/lib/extension";

export const metadata = constructMetadata(
  "Browser extension",
  "Send a role from LinkedIn, Indeed, Seek or any careers page straight into your Sartho pipeline.",
  "/extension",
);

/*
 * How to actually get the extension — a download and four steps.
 *
 * What was here was five sections and about forty sentences: what it does, a
 * three-row table of browsers with a "to publish properly" column for each, a
 * five-step install, and six paragraphs on permissions. Step one said "get
 * sartho-extension.zip from the Sartho repository", which asks somebody who
 * wants a browser extension to go and find a git repository — and there was no
 * download link on the page at all, because the zip was gitignored and outside
 * public/, so nothing was ever downloadable.
 *
 * Somebody arriving here wants the file and the four things to click. The
 * roadmap for Firefox and Safari was interesting to exactly one person, and it
 * is not the visitor.
 *
 * No sign-in required: somebody sent this link by a friend should be able to
 * read it, and download from it, before they have an account.
 */

const STEPS: Array<{ do: string; note: string }> = [
  {
    do: "Unzip it, somewhere you will keep.",
    note: "The browser loads the extension from that folder every time it starts, so Downloads is a poor choice.",
  },
  {
    do: "Open chrome://extensions",
    note: "Paste it into the address bar. Edge is edge://extensions, Brave is brave://extensions.",
  },
  {
    do: "Turn on Developer mode.",
    note: "Top-right corner. It allows an extension that did not come from the store, and changes nothing else.",
  },
  {
    do: "Click Load unpacked, choose the sartho-extension folder.",
    note: "Then click the puzzle-piece icon in the toolbar and pin Sartho, so it is one click from an advert.",
  },
];

export default function ExtensionPage() {
  return (
    <div className="page-stack product-page">
      <ProductPageHeader
        eyebrow="Browser extension"
        title="Send a role straight from the job board"
        description="Open an advert on LinkedIn, Indeed, Seek or a company careers page, click Sartho, and the role lands in your pipeline scored against your evidence."
      />

      <section className="glass-card extension-install">
        <a className="primary-button extension-download" href={EXTENSION_DOWNLOAD_PATH} download>
          Download for Chrome<span aria-hidden="true"> →</span>
        </a>
        <p className="extension-meta">
          Version {EXTENSION_VERSION} · Works in Chrome, Edge, Brave, Arc and Opera. Firefox and Safari are not supported yet.
        </p>

        <ol className="extension-steps">
          {STEPS.map((step) => (
            <li key={step.do}>
              <strong>{step.do}</strong>
              <span>{step.note}</span>
            </li>
          ))}
        </ol>

        <p className="extension-meta">
          Sartho is not in the Chrome Web Store yet, so this is the manual route. It takes about a minute.
        </p>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">What it can see</h2>
            <p className="section-subtitle">Worth knowing before you install anything into your browser.</p>
          </div>
        </div>
        <ul className="extension-facts">
          <li>
            <strong>It reads a page only when you click it.</strong> There is no standing permission on LinkedIn, Indeed or anywhere else — clicking the icon grants access to that one tab, for that one moment.
          </li>
          <li>
            <strong>It talks to Sartho and nowhere else.</strong> The only site it may run on by itself is sartho.tech.
          </li>
          <li>
            <strong>Nothing is lost if a save fails.</strong> A captured role stays queued in the extension until Sartho confirms it saved, so signing in or closing the tab does not cost you the advert.
          </li>
        </ul>
      </section>
    </div>
  );
}
