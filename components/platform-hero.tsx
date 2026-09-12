import Link from "next/link";

/*
 * What Sartho actually does, said once, on the page everybody lands on.
 *
 * The product had no answer to "what is this". The dashboard opened straight
 * into whichever step was next, which is right for somebody mid-flow and tells
 * a person nothing about the four things they have not reached yet — and the
 * browser extension, a real packaged download, was reachable only from a pill
 * on one page shown only to people who had not installed it. Anybody who
 * dismissed it, or who wanted it on a second machine, had nowhere to go.
 *
 * Deliberately not a marketing panel. Each line names something the product
 * does and links to the page that does it, so the card is a way in rather than
 * a description of one.
 */

type Feature = {
  title: string;
  body: string;
  href: string;
  action: string;
  /* Emitted as a data attribute so the stylesheet can tint each tile. */
  tone: "evidence" | "search" | "resume" | "extension";
};

const FEATURES: Feature[] = [
  {
    tone: "evidence",
    title: "Career truth, not claims",
    body: "Your résumé is read once into evidence you approve. Every line Sartho writes afterwards cites it, so nothing on your résumé is something you cannot back.",
    href: "/career-truth",
    action: "Upload a résumé",
  },
  {
    tone: "search",
    title: "Roles scored against your evidence",
    body: "Sartho reads the whole advert and says how much of it you can actually evidence — not how many keywords matched.",
    href: "/search-plan",
    action: "Find roles",
  },
  {
    tone: "resume",
    title: "A master résumé, and one per role",
    body: "Write the master once. Every tailored version starts from it, keeps its own history, and says what tailoring was worth.",
    href: "/resume-studio",
    action: "Open Résumé Studio",
  },
  {
    tone: "extension",
    title: "Save a role from anywhere",
    body: "The browser extension sends a posting from LinkedIn, Seek or an employer's own careers page straight into Sartho, with the full advert intact.",
    href: "/extension",
    action: "Install the extension",
  },
];

export function PlatformHero() {
  return (
    <section className="glass-card content-card platform-hero" aria-labelledby="platform-hero-title">
      <div className="card-header">
        <div>
          <h2 className="section-heading" id="platform-hero-title">What Sartho does</h2>
          <p className="section-subtitle">
            Four things, each grounded in evidence you approved. Nothing here writes a claim you cannot back.
          </p>
        </div>
      </div>

      <ul className="platform-hero-grid">
        {FEATURES.map((feature) => (
          <li className="platform-hero-tile" data-tone={feature.tone} key={feature.href}>
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
            <Link href={feature.href} className="platform-hero-action">
              {feature.action} <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
