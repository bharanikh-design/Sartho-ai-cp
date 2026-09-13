import Link from "next/link";
import { PlatformHero } from "@/components/platform-hero";
import { LandingHero } from "@/components/landing/landing-hero";
import { ProductCarousel } from "@/components/landing/product-carousel";

/*
 * The front door, for somebody who does not have an account yet.
 *
 * There was not one. Every path including "/" redirected to a sign-in form, so
 * sartho.tech had no public face at all: a link sent to a friend opened a login
 * page, and a person who wanted to know what this was before handing over an
 * email address had nowhere to find out. Google noticed before any person did —
 * brand verification fetches the home page, found a login form, and failed.
 *
 * Two attempts at the hero were thrown away before this one. The first was a
 * column of text down the left third of a wide screen with two thirds of
 * nothing beside it; the second filled that space with an invented layout.
 * Both were worse than the entry screen already sitting at /login, which is
 * the best-looking thing in the product.
 *
 * So the page opens on that screen's own corridor and sentence, and everything
 * below it is the substance: what Sartho produces, what it does, and what it
 * refuses to do.
 */
export function SignedOutHome() {
  return (
    <div className="landing">
      <LandingHero />

      <div className="landing-body" id="what-it-does">
        <ProductCarousel />

        <PlatformHero signedOut />

        <section className="glass-card content-card landing-limit">
          <div className="card-header">
            <div>
              <h2 className="section-heading">What it will not do</h2>
              <p className="section-subtitle">The constraint the whole product is built around.</p>
            </div>
          </div>
          <p className="policy-prose">
            It will not invent a qualification, inflate a figure, or describe you
            as something you have not evidenced. A requirement you cannot support
            is reported as a gap rather than quietly filled in. That is a
            deliberate limit: a tool that writes you into a job you cannot do is
            not helping, it is arranging an interview you cannot survive.
          </p>
        </section>
      </div>

      <section className="landing-close">
        <h2 className="landing-close__title">Start with what you can already prove.</h2>
        <Link href="/login" className="lh-enter">
          Sign in <span aria-hidden="true">→</span>
        </Link>
        <p className="policy-footer">
          <Link href="/privacy">Privacy</Link>
          {" · "}
          <Link href="/terms">Terms</Link>
        </p>
      </section>
    </div>
  );
}
