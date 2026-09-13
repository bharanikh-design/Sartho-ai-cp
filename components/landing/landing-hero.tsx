import Image from "next/image";
import Link from "next/link";
import sarthoIcon from "@/sartho.png";
import { ENTRY_ART } from "@/lib/brand/entry-art";

/*
 * The front door, in the language the product already had.
 *
 * The first attempt at this page invented its own look — a two-column hero
 * with a floating product card — and it was worse than the entry screen
 * sitting one route away. That screen is the best-looking thing in Sartho: a
 * lit doorway at the end of a corridor, one sentence, the name, one way in.
 * There was no reason to design a second front door, and every reason not to:
 * somebody arriving at sartho.tech and somebody arriving at /login should
 * recognise the same product.
 *
 * So this is the same corridor, the same sentence and the same lockup, laid
 * out for a page that scrolls rather than a screen that is walked through.
 */
export function LandingHero() {
  return (
    <section className="lh">
      {/*
        * The corridor, painted as a backdrop rather than placed in the flow,
        * so it can never crowd the words at any window size. Its own edges are
        * near-black and masked out on all four sides, so it reads as light in
        * a dark room instead of a picture pasted onto the page.
        */}
      <div className="lh-scene" aria-hidden="true" style={{ backgroundImage: `url("${ENTRY_ART}")` }} />
      <div className="lh-scrim" aria-hidden="true" />

      <div className="lh-body">
        <h1 className="lh-line">
          Your own headhunter. <em>Finally.</em>
        </h1>

        <span className="lh-lockup">
          <Image src={sarthoIcon} alt="" width={152} height={152} quality={95} priority />
          <span>
            <strong>Sartho</strong>
            <small>Your Career CoPilot</small>
          </span>
        </span>

        <p className="lh-sub">
          Someone who knows your whole career, finds the roles worth your
          experience, and makes sure you walk in ready — without ever writing a
          claim you cannot back.
        </p>

        <div className="lh-actions">
          <Link href="/login" className="lh-enter">Continue to Sign In</Link>
          <Link href="/extension" className="lh-quiet">Get the browser extension</Link>
        </div>
      </div>

      {/*
        * A reason to keep going, on a page that scrolls where the entry screen
        * ends. Without it the corridor reads as the whole page and there is no
        * sign that anything follows.
        */}
      <a className="lh-more" href="#what-it-does">
        See what it does <span aria-hidden="true">↓</span>
      </a>
    </section>
  );
}
