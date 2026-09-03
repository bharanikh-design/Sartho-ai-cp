import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

/*
 * Shared links rendered as a bare URL — no title card, no image — because the
 * app declared no Open Graph tags. For a product whose natural distribution is
 * a LinkedIn post or a beta invite, the preview IS the first impression.
 *
 * Drawn in code rather than committed as a PNG so the wording can never fall
 * out of step with the site, and so there is no binary to regenerate by hand.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#04050a",
          // The lit doorway of the landing screen, reduced to its glow.
          backgroundImage:
            "radial-gradient(circle at 50% 118%, rgba(150,130,255,0.55) 0%, rgba(80,70,180,0.18) 38%, rgba(4,5,10,0) 68%)",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(196,204,255,0.72)",
          }}
        >
          {SITE_NAME}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 34,
            paddingLeft: 90,
            paddingRight: 90,
            fontSize: 92,
            fontWeight: 600,
            lineHeight: 1.04,
            letterSpacing: "-0.045em",
            textAlign: "center",
            color: "#f4f6ff",
          }}
        >
          {SITE_TAGLINE}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: 34,
            color: "rgba(196,204,255,0.78)",
          }}
        >
          Your Career CoPilot
        </div>
      </div>
    ),
    { ...size },
  );
}
