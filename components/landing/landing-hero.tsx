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

      {/*
        * Head and foot, with the corridor owning the space between them.
        *
        * Everything sat in one centred stack to begin with, which put the
        * lockup and the paragraph directly on the lit doorway — the brightest
        * thing on the screen — where "Your Career CoPilot" all but vanished.
        * Separating the head from the foot is how the entry screen avoided
        * that, and it is the whole trick.
        */}
      <div className="lh-head">
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
      </div>

      <div className="lh-foot">
        <div className="lh-actions">
          <Link href="/login" className="lh-enter">Continue to Sign In</Link>
          <Link href="/extension" className="lh-quiet">Get the browser extension</Link>
        </div>

        {/*
          * The entry screen ended at its button; this page does not, and
          * without a cue the corridor reads as the whole of it.
          */}
        <a className="lh-more" href="#what-it-does">
          See what it does <span aria-hidden="true">↓</span>
        </a>
      </div>
    </section>
  );
}
