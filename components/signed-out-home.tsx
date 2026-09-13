import Link from "next/link";
import { PlatformHero } from "@/components/platform-hero";
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
 * The first version of this page was a column of text down the left third of a
 * wide screen with two thirds of nothing beside it, which reads as broken
 * rather than as restraint. So the hero is now two columns, and the thing
 * filling the second one is the product: a scored match, rendered in the same
 * tokens the real card uses. The shortest honest answer to "what is this" is to
 * show what it produces.
 */
export function SignedOutHome() {
  return (
    <div className="landing">
      {/*
        * Light, not motion, is where atmosphere comes from. Two slow aurora
        * fields and a vignette, painted behind everything and marked
        * decorative so a screen reader never meets them.
        */}
      <div className="landing-aurora" aria-hidden="true">
        <span className="landing-aurora__field landing-aurora__field--violet" />
        <span className="landing-aurora__field landing-aurora__field--blue" />
        <span className="landing-aurora__grid" />
      </div>

      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="landing-eyebrow">Sartho</p>
          <h1 className="landing-title">
            A career copilot that will not write a claim you cannot back.
          </h1>
          <p className="landing-lede">
            Sartho reads your résumé once into evidence you approve, then scores
            real job adverts against it — telling you how much of a role you can
            actually evidence, and where the gaps are. Every résumé line it
            writes cites something you confirmed.
          </p>
          <div className="landing-actions">
            <Link href="/login" className="primary-button landing-cta">
              Sign in <span aria-hidden="true">→</span>
            </Link>
            <Link href="/extension" className="secondary-button">
              Get the browser extension
            </Link>
          </div>
          <p className="landing-trust">
            Google for Jobs · LinkedIn · Seek · employers&rsquo; own careers pages
          </p>
        </div>

        {/*
          * The product, floating. Same markup shape as a real match card so it
          * cannot quietly drift from what the product actually renders, and no
          * image asset to go stale or blur on a retina screen.
          *
          * The employer is invented. Putting a real company's name on an
          * assessment Sartho never made would be a small dishonesty on the one
          * page that claims the product does not deal in those.
          */}
        <div className="landing-hero__preview" aria-hidden="true">
          <div className="landing-preview-card">
            <div className="stage-card__top">
              <span className="stage-card__employer">Northgate Advisory · Singapore</span>
              <span className="stage-chip stage-chip--apply">APPLY</span>
            </div>
            <h4 className="stage-card__title">Engagement Manager, Professional Services</h4>
            <p className="stage-card__meta"><strong>82% match</strong> · Google for Jobs</p>
            <p className="stage-card__insight">
              ServiceNow, ITSM and business process consulting align with
              managing enterprise engagements. Commercial upsell across the
              region is not evidenced in this profile.
            </p>
            <div className="stage-tags">
              {["Project Management", "Team Leadership", "IT Operations", "Consulting"].map((tag) => (
                <span className="stage-tag" key={tag}>{tag}</span>
              ))}
            </div>
            <p className="landing-preview-card__foot">Asks for 5 years — you evidence 11</p>
          </div>
        </div>
      </section>

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

      <section className="landing-close">
        <h2 className="landing-close__title">Start with what you can already prove.</h2>
        <Link href="/login" className="primary-button landing-cta">
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
