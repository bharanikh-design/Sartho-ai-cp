import { PlatformHero } from "@/components/platform-hero";
import { ProductCarousel } from "@/components/landing/product-carousel";
import { SignInExperience } from "@/components/auth/sign-in-experience";

const signedOutHomeComposition = `
/*
 * The sign-in component owns the auth mechanics and base tokens. The public
 * home page owns composition. The screenshot showed the two columns pinned to
 * opposite edges of a 2.5k-wide canvas, leaving an elementary dead zone in the
 * middle. Keep the same copy and auth card, but pull the stage into an editorial
 * measure, align the brand with that measure, and give the proof row enough
 * finish that the left side feels designed rather than abandoned.
 */
@media (min-width: 941px) {
  .landing > .si {
    padding-inline: clamp(28px, 4vw, 72px);
  }

  .landing > .si .si-brand,
  .landing > .si .si-stage {
    width: min(100%, 1480px);
    margin-inline: auto;
  }

  .landing > .si .si-brand {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .landing > .si .si-stage {
    grid-template-columns: minmax(520px, 720px) minmax(370px, 420px);
    justify-content: center;
    column-gap: clamp(52px, 6vw, 112px);
  }

  .landing > .si .si-pitch {
    justify-content: center;
    gap: clamp(34px, 5vh, 62px);
  }

  .landing > .si .si-pitch-lead {
    position: relative;
    padding: clamp(12px, 1.4vw, 22px) 0 clamp(14px, 1.8vw, 26px);
  }

  .landing > .si .si-pitch-lead::before {
    content: "";
    position: absolute;
    left: -22px;
    top: 18px;
    bottom: 18px;
    width: 1px;
    background: linear-gradient(180deg, transparent, rgba(120, 120, 255, .58), rgba(90, 190, 255, .48), transparent);
    opacity: .72;
  }

  .landing > .si .si-pitch h1 {
    font-size: clamp(48px, 5.25vw, 84px);
    max-width: 12.5ch;
  }

  .landing > .si .si-pitch p {
    max-width: 38ch;
    margin-top: clamp(26px, 4.8vh, 54px);
  }

  .landing > .si .si-proof {
    width: fit-content;
    margin: 0;
    padding: 14px 16px;
    border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
    border-radius: 999px;
    background: color-mix(in srgb, var(--text) 4%, transparent);
    box-shadow: 0 18px 54px rgba(0, 0, 0, .22);
    backdrop-filter: blur(18px);
  }

  .landing > .si .si-panel {
    align-self: center;
    min-height: 408px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    box-shadow: 0 24px 80px rgba(0, 0, 0, .54), 0 0 0 1px rgba(255, 255, 255, .025) inset;
  }
}

@media (min-width: 1500px) {
  .landing > .si .si-stage,
  .landing > .si .si-brand {
    width: min(100%, 1560px);
  }
}

@media (min-width: 941px) and (max-height: 760px) {
  .landing > .si .si-pitch h1 {
    font-size: clamp(44px, 5vw, 74px);
  }

  .landing > .si .si-stage {
    align-content: start;
  }
}
`;

/*
 * The front door: sign in where you land.
 *
 * This page has been rebuilt three times and each attempt put something in
 * front of the thing people came for. The last one opened on the entry screen
 * — the lit corridor — which was beautiful and also a screen you had to get
 * past before you could reach Google, and /login showed you the identical
 * screen again on the other side of it.
 *
 * So there is no screen in front of anything now. Google and LinkedIn are on
 * the page you arrive at, and everything explaining the product is underneath
 * them for whoever wants it.
 *
 * That "underneath" is not decoration. Google's OAuth brand verification
 * rejects an application whose home page is a login form and nothing else —
 * "your homepage is behind a login page" is the exact refusal that sent this
 * page through three rewrites. A page that signs you in and also says what it
 * is satisfies both, which is what should have been built first.
 */
export function SignedOutHome() {
  return (
    <div className="landing">
      <SignInExperience />
      <style>{signedOutHomeComposition}</style>

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

    </div>
  );
}
