import { PlatformHero } from "@/components/platform-hero";
import { ProductCarousel } from "@/components/landing/product-carousel";
import { FrontDoor } from "@/components/landing/front-door";

/*
 * The front door: sign in where you land.
 *
 * This page has been rebuilt more than once and each early attempt put something
 * in front of the thing people came for. So there is no screen in front of
 * anything: Google, GitHub and Apple are on the page you arrive at, and
 * everything explaining the product is underneath them for whoever wants it.
 *
 * That "underneath" is not decoration. Google's OAuth brand verification rejects
 * an application whose home page is a login form and nothing else — "your
 * homepage is behind a login page" is the exact refusal that sent this page
 * through three rewrites. A page that signs you in and also says what it is
 * satisfies both, which is what should have been built first.
 */
export function SignedOutHome() {
  return (
    <div className="landing">
      <FrontDoor />

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
