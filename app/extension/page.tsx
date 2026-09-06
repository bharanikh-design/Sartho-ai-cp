import Link from "next/link";
import { ProductPageHeader } from "@/components/product-page-header";
import { constructMetadata } from "@/lib/seo";

export const metadata = constructMetadata(
  "Browser extension",
  "Send a role from LinkedIn, Indeed, Seek or any careers page straight into your Sartho pipeline.",
  "/extension",
);

/*
 * How to actually get the extension.
 *
 * It is not in the Chrome Web Store, and that is said here in the first line
 * rather than discovered at step four. A store listing needs a developer
 * account and a review, and until that exists the honest instruction is the
 * unpacked one — which works today, on every Chromium browser, and is exactly
 * what the people testing Sartho need.
 *
 * No sign-in required: somebody sent this link by a friend should be able to
 * read it before they have an account.
 */

const STEPS: Array<{ title: string; detail: string }> = [
  {
    title: "Download the folder",
    detail: "Get sartho-extension.zip from the Sartho repository and unzip it somewhere you will not delete by accident — the browser loads it from that folder every time it starts, so Downloads is a poor choice.",
  },
  {
    title: "Open your browser's extensions page",
    detail: "chrome://extensions in Chrome, edge://extensions in Edge, brave://extensions in Brave. Paste it into the address bar; the menu route is buried.",
  },
  {
    title: "Turn on Developer mode",
    detail: "The switch is in the top-right corner. It is what allows an extension that did not come from the store, and it changes nothing else about your browser.",
  },
  {
    title: "Click “Load unpacked” and choose the folder",
    detail: "Pick the folder containing manifest.json — not the zip, and not the folder above it. Sartho appears in your extensions list straight away.",
  },
  {
    title: "Pin it to the toolbar",
    detail: "Click the puzzle-piece icon, then the pin beside Sartho. The whole point is one click from a job advert, which needs the icon to be visible.",
  },
];

export default function ExtensionPage() {
  return (
    <div className="page-stack product-page">
      <ProductPageHeader
        eyebrow="Browser extension"
        title="Send a role straight from the job board"
        description="Open an advert on LinkedIn, Indeed, Seek or a company careers page, click Sartho, and the role lands in your pipeline scored against the evidence you approved."
      />

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">What it does</h2>
            <p className="section-subtitle">Three steps, one click.</p>
          </div>
        </div>
        <ol className="extension-flow">
          <li>
            <strong>Reads the advert off the page.</strong> It looks first for the structured job data most boards publish, and falls back to the page itself — so it works well beyond LinkedIn and Indeed.
          </li>
          <li>
            <strong>Shows you what it read.</strong> Title, employer, location and how much of the description it found, before anything is sent. If it has the wrong thing, you will see that here rather than in your pipeline.
          </li>
          <li>
            <strong>Saves it and scores it.</strong> The role appears in your <Link href="/applications" className="direction-inline-link">applications pipeline</Link> with a match against your approved evidence. Sending the same advert twice updates it instead of adding a second copy.
          </li>
        </ol>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">Installing it</h2>
            <p className="section-subtitle">
              Sartho is not in the Chrome Web Store yet, so this is the manual route. It takes about a minute and works in Chrome, Edge, Brave and Arc.
            </p>
          </div>
        </div>
        <ol className="extension-steps">
          {STEPS.map((step) => (
            <li key={step.title}>
              <strong>{step.title}</strong>
              <p className="section-subtitle">{step.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="glass-card content-card">
        <div className="card-header">
          <div>
            <h2 className="section-heading">What it can and cannot see</h2>
            <p className="section-subtitle">Worth reading before you install anything into your browser.</p>
          </div>
        </div>
        <ul className="extension-facts">
          <li>
            <strong>It reads a page only when you click it.</strong> There is no standing permission on LinkedIn, Indeed or anywhere else — clicking the icon is what grants access, to that one tab, for that one moment.
          </li>
          <li>
            <strong>It talks to Sartho and nowhere else.</strong> The only sites it is permitted to run on by itself are sartho.tech and your own machine during development.
          </li>
          <li>
            <strong>It never fills in an application for you.</strong> An earlier version had a button for that. It could not work — Sartho holds no name, email or phone number to type — and a button that can only fail is worse than no button, so it is gone.
          </li>
          <li>
            <strong>Nothing is lost if a save fails.</strong> A captured role stays queued in the extension until Sartho confirms it saved, so signing in, reloading, or closing the tab does not cost you the advert.
          </li>
        </ul>
      </section>
    </div>
  );
}
