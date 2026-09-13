import Link from "next/link";
import { PlatformHero } from "@/components/platform-hero";

/*
 * The front door, for somebody who does not have an account yet.
 *
 * There was not one. Every path including "/" redirected to a sign-in form, so
 * sartho.tech had no public face at all: a link sent to a friend opened a login
 * page, and a person who wanted to know what this was before handing over an
 * email address had nowhere to find out.
 *
 * Google noticed before any person did. Brand verification fetches the
 * application home page, found a login form, and failed with "your homepage is
 * behind a login page" — which is why the consent screen kept naming a Supabase
 * project reference instead of Sartho.
 *
 * So this is not a page built for a verification check. It is the page the
 * product needed anyway, and the check is what made that obvious.
 */
export function SignedOutHome() {
  return (
    <div className="page-stack product-page">
      <section className="glass-card content-card signed-out-hero">
        <p className="signed-out-eyebrow">Sartho</p>
        <h1 className="signed-out-title">
          A career copilot that will not write a claim you cannot back.
        </h1>
        <p className="signed-out-lede">
          Sartho reads your résumé once into evidence you approve, then scores
          real job adverts against it — telling you how much of a role you can
          actually evidence, and where the gaps are. Every résumé line it writes
          cites something you confirmed.
        </p>
        <div className="signed-out-actions">
          <Link href="/login" className="primary-button">
            Sign in <span aria-hidden="true">→</span>
          </Link>
          <Link href="/extension" className="secondary-button">
            Get the browser extension
          </Link>
        </div>
      </section>

      <PlatformHero signedOut />

      <section className="glass-card content-card">
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

      <p className="policy-footer">
        <Link href="/privacy">Privacy</Link>
        {" · "}
        <Link href="/terms">Terms</Link>
      </p>
    </div>
  );
}
