"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { AUTH_ORIGIN, isAllowedAuthOrigin, resolveAuthOrigin } from "@/lib/site";
import sarthoIcon from "@/sartho.png";

/*
 * Sign-in.
 *
 * Split composition: the promise holds the left, every way in sits on the
 * right. The brand lockup stays whole — mark, wordmark and tagline together —
 * because the front door is where identity should be most complete, not least.
 *
 * Styling runs on the shared design tokens, so the page follows the Dark/Light
 * switch along with the rest of the product.
 */

/*
 * Supabase names the LinkedIn provider "linkedin_oidc"; the bare "linkedin"
 * id is the retired OAuth 2.0 one and is rejected.
 */
const PROVIDERS = ["google", "github", "apple"] as const;
type Provider = (typeof PROVIDERS)[number];


const styles = `
.si {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: clamp(44px, 9vh, 96px);
  padding: clamp(22px, 3.2vw, 46px);
  color: var(--text);
  overflow: hidden;
}
/*
 * Colour, rather than a tint of it.
 *
 * One faint violet blur at 20% read as a smudge on an off-white page — the
 * palette was present but never actually seen. Three overlapping fields at
 * real strength give the page a light source: violet high on the left where
 * the headline sits, blue behind the card, and a warm low note underneath so
 * the wash is not a single hue stretched across the whole screen. All three
 * are mixed from the theme tokens, so the dark theme deepens where the light
 * theme brightens instead of needing a second set of colours.
 */
.si::before,
.si::after {
  display: none;
}
.si::before {
  top: -36%; left: -28%;
  width: min(92vw, 1180px); aspect-ratio: 1;
  border: 1px solid transparent;
  border-right-color: rgba(110,110,255,.68);
  border-bottom-color: rgba(80,165,255,.82);
  background: transparent;
  filter: drop-shadow(0 0 5px rgba(95,120,255,.38));
  opacity: .72;
  animation: siArcDrift 12s ease-in-out infinite alternate;
}
.si::after {
  right: -14%; bottom: -34%;
  width: min(80vw, 900px); aspect-ratio: 1;
  background:
    radial-gradient(circle at 46% 50%, color-mix(in srgb, var(--blue) 52%, transparent), transparent 60%),
    radial-gradient(circle at 24% 78%, color-mix(in srgb, var(--rose) 30%, transparent), transparent 64%);
  filter: blur(72px);
  opacity: .58;
}
/* The dark theme carries deeper colour before it turns to mud. */
:root[data-theme="dark"] .si::before { opacity: .72; }
:root[data-theme="dark"] .si::after { opacity: 0; }

/* Light mode needs contrast from tokens, not taste. */
:root[data-theme="light"] .si-proof,
:root[data-theme="light"] .si-note,
:root[data-theme="light"] .si-brand small,
:root[data-theme="light"] .si-or {
  color: var(--text-secondary);
}

/* The light palette is already bright; avoid the rose wash. */
:root[data-theme="light"] .si::after { display:none; }
.si-logo {
  width: clamp(52px, 4vw, 64px); height: clamp(52px, 4vw, 64px);
  border-radius: 18px; flex: none;
}
.si-brand strong { display: block; font-size: clamp(22px, 1.9vw, 27px); font-weight: 660; letter-spacing: -0.032em; }
.si-brand small { display: block; margin-top: 4px; font-size: 13px; color: var(--text-tertiary); }

/* Stage */
/*
 * The headline starts on the card's line.
 *
 * This is the whole trick, and it is what centring the shorter column inside
 * the taller one's row got wrong: the card fills the row, so a centred pitch
 * begins a hundred and ninety pixels below it and the two columns read as
 * unrelated. Anchoring the pitch to the top of the row gives them a shared
 * edge, and what is left over collects below the shorter column, where it is
 * ordinary margin rather than a gap in the middle of the composition.
 */
.si-stage {
  position: relative; z-index: 2;
  display: grid;
  grid-template-columns: minmax(0, 1.06fr) minmax(340px, 430px);
  /*
   * One row, sized to its content and centred in whatever height is left.
   *
   * Left as 1fr the row swallowed the leftover space, so stretching the pitch
   * stretched it past the card rather than to it. Sized to content, the row is
   * exactly the card's height and both columns stretch to the same line.
   */
  grid-template-rows: auto;
  align-content: center;
  gap: clamp(38px, 6vw, 90px);
  align-items: stretch;
}

/*
 * The left column is given the card's height and spends it.
 *
 * The card is the taller of the two, so stretching the pitch to the row makes
 * both columns start and finish on the same lines; the lead sits at the top and
 * the proof line at the foot, with the slack collecting between them instead of
 * trailing off below a column that stopped early. The gap is the floor, so on a
 * short window the two blocks close up rather than overlapping.
 */
.si-pitch {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: clamp(28px, 5vh, 64px);
}

.si-pitch h1 {
  max-width: 12ch;
  margin: 0;
  font-size: clamp(40px, 6.4vw, 92px);
  line-height: .94;
  letter-spacing: -0.05em;
  font-weight: 600;
  text-wrap: balance;
  animation: siRise 1s cubic-bezier(.2,.7,.2,1) .08s both;
}
.si-pitch h1 em {
  font-style: normal;
  text-shadow: 0 0 60px color-mix(in srgb, var(--violet) 50%, transparent);
}
.si-pitch p {
  /*
   * Body copy at a body-copy size. 15px with a 1.6 leading is interface text,
   * and this is a sentence someone is meant to read — 17-19px over a measure
   * of about 40 characters at 1.65 is where prose stops being a caption. The
   * space above it is set from viewport height so the headline and the
   * sentence stay two separate thoughts on any window.
   */
  max-width: 40ch;
  margin: clamp(38px, 8vh, 92px) 0 0;
  color: var(--text-secondary);
  font-size: clamp(16px, 1.35vw, 19px);
  line-height: 1.65;
  letter-spacing: -0.005em;
  animation: siRise 1s ease .18s both;
}

/*
 * What the headline is promising, in two or three words each — and the foot
 * the left column needs to hold its own beside the card.
 */
.si-proof {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 10px 14px;
  /* Lifted off the foot so it reads as the column's last line rather than
     something resting on the bottom edge. */
  margin: 0 0 clamp(20px, 3vh, 34px); padding: 0;
  list-style: none;
  color: var(--text-tertiary);
  font-size: 12.5px; font-weight: 560; letter-spacing: 0.055em; text-transform: uppercase;
  animation: siRise 1s ease .3s both;
}
.si-proof li { display: flex; align-items: center; gap: 14px; }
/*
 * The separator trails its own item rather than leading the next one. Owned by
 * the following item, a wrap carries the dot to the start of the new line and
 * the list reads as though it began with a bullet.
 */
.si-proof li:not(:last-child)::after {
  content: "";
  width: 3px; height: 3px;
  border-radius: 999px;
  background: currentColor;
  opacity: .6;
}

/* Panel */
.si-panel {
  position: relative;
  justify-self: end;
  width: 100%;
  padding: clamp(22px, 2.1vw, 28px);
  border: 1px solid var(--line);
  border-radius: 26px;
  background: #050506;
  box-shadow:
    var(--shadow),
    0 0 90px -10px color-mix(in srgb, var(--violet) 42%, transparent),
    0 0 160px 10px color-mix(in srgb, var(--blue) 20%, transparent);
  backdrop-filter: blur(20px);
  animation: siRise 1s ease .26s both;\n  overflow: hidden;
}
.si-panel::after {
  content:"";
  position:absolute;
  inset:0;
  border-radius:26px;
  padding:1px;
  background:conic-gradient(from var(--si-line-angle,0deg), transparent 0 78%, rgba(120,110,255,.95) 84%, rgba(105,190,255,.95) 87%, transparent 92%);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;
  mask-composite:exclude;
  pointer-events:none;
  animation:siBorderLine 7s linear infinite;
}
@property --si-line-angle { syntax:"<angle>"; initial-value:0deg; inherits:false; }
@keyframes siBorderLine { to { --si-line-angle:360deg; } }
.si-panel h2 { margin: 0; font-size: 20px; font-weight: 640; letter-spacing: -0.026em; text-align: center; }
.si-sub { margin: 7px 0 0; color: var(--text-secondary); font-size: 13px; line-height: 1.5; text-align: center; }

.si-providers { display: grid; gap: 8px; margin-top: 16px; }
.si-provider {
  width: 100%; min-height: 46px;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  border: 1px solid var(--line-bright);
  border-radius: 13px;
  color: var(--text);
  background: color-mix(in srgb, var(--text) 5%, transparent);
  cursor: pointer; font: inherit;
  font-size: 14px; font-weight: 560;
  transition: background .2s ease, border-color .2s ease, transform .2s ease;
}
.si-provider:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--text) 28%, transparent);
  background: color-mix(in srgb, var(--text) 9%, transparent);
}
.si-provider:disabled { opacity: .55; cursor: progress; }
.si-provider svg { flex: none; }
.si-provider-icons { display:flex; align-items:center; justify-content:center; gap:24px; margin:28px 0 12px; }
.si-provider-icon { display:grid; place-items:center; width:58px; height:58px; border:1px solid var(--line-bright); border-radius:16px; color:var(--text); background:color-mix(in srgb,var(--text) 5%,transparent); cursor:pointer; transition:transform .18s ease,background .18s ease,border-color .18s ease; }
.si-provider-icon:hover:not(:disabled){ transform:translateY(-2px); background:color-mix(in srgb,var(--text) 10%,transparent); border-color:color-mix(in srgb,var(--text) 30%,transparent); }
.si-provider-icon:disabled{opacity:.5;cursor:progress}

.si-or {
  display: flex; align-items: center; gap: 12px;
  margin: 15px 0;
  color: var(--text-tertiary); font-size: 11.5px;
}
.si-or::before, .si-or::after { content: ""; height: 1px; flex: 1; background: var(--line); }

.si-form { display: grid; gap: 10px; }
.si-form label { display: grid; gap: 6px; }
.si-form label > span { font-size: 12px; font-weight: 560; color: var(--text-secondary); }
.si-form input {
  width: 100%; min-height: 46px;
  padding: 0 13px;
  border: 1px solid var(--line-bright);
  border-radius: 12px;
  color: var(--text);
  background: color-mix(in srgb, var(--canvas) 55%, transparent);
  font-size: 14px;
  outline: none;
  transition: border-color .2s ease, box-shadow .2s ease;
}
.si-form input::placeholder { color: var(--text-tertiary); }
.si-form input:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--blue) 18%, transparent);
}

.si-submit {
  width: 100%; min-height: 48px;
  margin-top: 3px;
  border: 0; border-radius: 13px;
  color: #fff;
  background: linear-gradient(135deg, #7c5cf0, #5b7ff0);
  cursor: pointer; font: inherit;
  font-size: 14px; font-weight: 620;
  box-shadow: 0 10px 26px color-mix(in srgb, var(--violet) 34%, transparent);
  transition: transform .2s ease, filter .2s ease;
}
.si-submit:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.08); }
.si-submit:disabled { opacity: .55; cursor: progress; }

.si-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-top: 12px; }
.si-link {
  border: 0; padding: 0; background: none;
  color: var(--blue); cursor: pointer; font: inherit;
  font-size: 12.5px;
}
.si-link:hover { text-decoration: underline; }

.si-msg {
  margin: 14px 0 0; padding: 11px 13px;
  border: 1px solid var(--line);
  border-radius: 12px;
  font-size: 12.5px; line-height: 1.5;
}
.si-msg.is-error { border-color: color-mix(in srgb, var(--rose) 40%, transparent); color: var(--rose); background: color-mix(in srgb, var(--rose) 10%, transparent); }
.si-msg.is-ok { border-color: color-mix(in srgb, var(--mint) 40%, transparent); color: var(--mint); background: color-mix(in srgb, var(--mint) 10%, transparent); }

.si-note {
  margin: 14px 0 0; padding-top: 13px;
  border-top: 1px solid var(--line);
  color: var(--text-tertiary); font-size: 11.5px; line-height: 1.55; text-align: center;
}

.si :is(button, a, input):focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }

@keyframes siArcDrift { from { transform:translate(-1.5%,1%) rotate(-2deg); } to { transform:translate(1.5%,-1%) rotate(2deg); } }\n@keyframes siRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }

@media (max-width: 940px) {
  .si-stage { grid-template-columns: 1fr; gap: 30px; align-items: start; }
  /* Stacked: no second column to match, so the row goes back to flowing. */
  .si-stage { grid-template-rows: none; align-content: start; }
  .si-panel { justify-self: stretch; align-self: start; }
  .si-pitch { display: block; }
  .si-pitch p { margin-top: 24px; }
  .si-proof { margin-top: 28px; font-size: 11.5px; }
  .si-pitch h1 { max-width: none; font-size: clamp(34px, 8vw, 52px); }
}
/*
 * Short windows — a laptop with browser chrome and a taskbar taking their cut.
 * The headline comes down with everything else so it never crowds the way in.
 */
/*
 * A sign-in card carrying three providers, an email pair and a footnote is
 * about 690px however it is packed, so on a short window the room has to come
 * from around it rather than out of it. The page chrome gives up its padding
 * before the card gives up a button — a card cut off at the fold is the worst
 * of the available outcomes.
 */
@media (max-height: 880px) and (min-width: 941px) {
  /* Height is what is scarce, so only the vertical measurements give way. */
  .si { padding: clamp(16px, 2.2vh, 30px) clamp(24px, 3.2vw, 46px); gap: clamp(30px, 6vh, 56px); }
  .si-logo { width: 48px; height: 48px; border-radius: 15px; }
  .si-brand strong { font-size: 22px; }
  .si-panel { padding: clamp(20px, 1.8vw, 26px); }
}
@media (max-height: 720px) {
}
@media (max-height: 560px) {
}
@media (prefers-reduced-motion: reduce) {
  /*
   * The landing screen still shows — it is content, and it waits on a click
   * either way. Only the motion goes.
   */
  .si * { animation: none !important; transition: none !important; }
}
`;

function friendlyAuthMessage(message: string) {
  const value = message.toLowerCase();

  if (value.includes("invalid api key")) {
    return "Sartho cannot reach its secure sign-in service yet. The Supabase connection saved in this deployment needs one correction.";
  }

  if (value.includes("unsupported provider") || value.includes("provider is not enabled")) {
    return "That sign-in method has not been switched on for Sartho yet. Enable it in Supabase, then try again.";
  }

  if (
    value.includes("unable to exchange external code") ||
    value.includes("invalid_client") ||
    value.includes("client secret")
  ) {
    return "The provider accepted your account, but Supabase could not complete the secure code exchange. The client secret saved in Supabase does not match this client ID.";
  }

  /*
   * /auth/callback rewrites this one before it reaches the page, so this branch
   * is for the copy that never goes through the callback — a failure the
   * browser client raises on its own.
   */
  if (value.includes("code verifier") || value.includes("code_verifier")) {
    const canonical = AUTH_ORIGIN.replace(/^https?:\/\//, "");
    return `This sign-in started on a different address than it finished on, so the browser could not prove the round trip was yours. Start again from ${canonical} and it will complete.`;
  }

  return message;
}

/*
 * The page's metadata lives in ./layout.tsx. Next disallows a `metadata` export
 * from a "use client" component, and exporting it here failed the build.
 */
export function SignInExperience() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const failure =
      hashParams.get("error_description") ??
      searchParams.get("error") ??
      hashParams.get("error");

    // Reads browser-only URL/hash params unavailable during SSR, so this must
    // run in an effect rather than being derived during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (failure) setError(friendlyAuthMessage(failure));

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, [router, supabase]);

  /*
   * Picks up a sign-in that began on another host.
   *
   * signInWithProvider sends the browser here when it cannot finish where it
   * started, and the click has to survive that move or the user is left staring
   * at a page that looks exactly like the one they just pressed a button on.
   * The parameter is cleared from the URL first, so a reload or a back button
   * never launches a second round trip.
   */
  useEffect(() => {
    const resume = new URLSearchParams(window.location.search).get("resume");
    if (!resume || !PROVIDERS.includes(resume as Provider)) return;

    const cleaned = new URL(window.location.href);
    cleaned.searchParams.delete("resume");
    window.history.replaceState(null, "", cleaned.toString());

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(resume);

    supabase.auth
      .signInWithOAuth({
        provider: resume as Provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/`,
          queryParams: resume === "google" ? { prompt: "select_account" } : undefined,
        },
      })
      .then(({ error: failure }) => {
        if (!failure) return;
        setBusy(null);
        setError(friendlyAuthMessage(failure.message));
      });
  }, [supabase]);

  /*
   * Both legs of a sign-in have to run on one origin.
   *
   * The redirect target used to be pinned to AUTH_ORIGIN no matter where the
   * button was pressed. Press it on www.sartho.tech, or on the vercel.app
   * deployment, and the PKCE code verifier is written into a cookie for that
   * host while Google returns to the apex, which never receives it — the
   * callback then fails with "PKCE code verifier not found in storage" and the
   * user is bounced back here with no way to get past it. Sending the browser
   * to the canonical origin *before* the round trip starts is the fix; sending
   * it there afterwards is the bug.
   */
  async function signInWithProvider(provider: Provider) {
    setBusy(provider);
    setError(null);

    const origin = window.location.origin;

    if (!isAllowedAuthOrigin(origin)) {
      // Leaves this host entirely, then resumes the same click on the other
      // side. `resume` is read once on arrival, and the canonical origin is
      // allowed by definition, so this cannot bounce twice.
      const handoff = new URL("/login", resolveAuthOrigin(origin));
      handoff.searchParams.set("resume", provider);
      window.location.replace(handoff.toString());
      return;
    }

    const { error: failure } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${origin}/auth/callback?next=/`,
        queryParams: provider === "google" ? { prompt: "select_account" } : undefined,
      },
    });

    if (failure) {
      setBusy(null);
      setError(friendlyAuthMessage(failure.message));
    }
  }

  return (
    <main className="si">
      <style>{styles}</style>

      <header className="si-brand">
        <Image className="si-logo" src={sarthoIcon} alt="" width={256} height={256} quality={95} priority />
        <span>
          <strong>Sartho</strong>
          <small>Your Career CoPilot</small>
        </span>
      </header>

      <div className="si-stage">
        <section className="si-pitch">
          {/* Grouped, so space-between puts the foot at the foot rather than
              floating the sentence away from the headline it belongs to. */}
          <div className="si-pitch-lead">
            <h1>Your own headhunter. <em>Finally.</em></h1>
            <p>
              Someone who knows your whole career, finds the roles worth your
              experience, and makes sure you walk in ready.
            </p>
          </div>

          <ul className="si-proof">
            <li>Role matching</li>
            <li>Résumé tailoring</li>
            <li>Interview preparation</li>
          </ul>
        </section>

        <section className="si-panel">
          <h2>Welcome to Sartho</h2>
          <p className="si-sub">Sign in securely with your preferred account.</p>
          <div className="si-provider-icons" aria-label="Sign in options">
            <button type="button" className="si-provider-icon" aria-label="Continue with Google" title="Google" onClick={() => signInWithProvider("google")} disabled={busy !== null}><GoogleIcon /></button>
            <button type="button" className="si-provider-icon" aria-label="Continue with GitHub" title="GitHub" onClick={() => signInWithProvider("github")} disabled={busy !== null}><GitHubIcon /></button>
            <button type="button" className="si-provider-icon" aria-label="Continue with Apple" title="Apple" onClick={() => signInWithProvider("apple")} disabled={busy !== null}><AppleIcon /></button>
          </div>
          {error ? <p className="si-msg is-error" role="alert">{error}</p> : null}
          <p className="si-note">Private beta · approved accounts only</p>
        </section>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.59-4.12H3.06v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.41 13.94A6.02 6.02 0 0 1 6.1 12c0-.67.12-1.33.31-1.94V7.44H3.06A10 10 0 0 0 2 12c0 1.61.38 3.14 1.06 4.56l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.83 1.5l2.87-2.88A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.94 5.44l3.35 2.62C7.2 7.7 9.4 5.94 12 5.94Z" />
    </svg>
  );
}

function GitHubIcon() {
  return <svg width="25" height="25" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.23c-3.22.7-3.9-1.37-3.9-1.37-.52-1.34-1.28-1.7-1.28-1.7-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.57-.29-5.27-1.29-5.27-5.73 0-1.27.45-2.3 1.19-3.11-.12-.29-.52-1.47.11-3.07 0 0 .97-.31 3.16 1.19a10.9 10.9 0 0 1 5.76 0c2.2-1.5 3.16-1.19 3.16-1.19.63 1.6.23 2.78.11 3.07.74.81 1.19 1.84 1.19 3.11 0 4.45-2.71 5.43-5.29 5.72.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"/></svg>;
}
function AppleIcon() {
  return <svg width="27" height="27" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.05 12.54c-.03-3.02 2.47-4.49 2.58-4.56a5.54 5.54 0 0 0-4.36-2.36c-1.83-.19-3.61 1.1-4.54 1.1-.95 0-2.38-1.08-3.93-1.05a5.78 5.78 0 0 0-4.86 2.96c-2.11 3.65-.54 9.02 1.49 11.97 1.02 1.45 2.2 3.07 3.75 3.01 1.52-.06 2.09-.97 3.93-.97 1.82 0 2.36.97 3.95.93 1.63-.02 2.66-1.46 3.64-2.93a12.1 12.1 0 0 0 1.67-3.4 5.2 5.2 0 0 1-3.32-4.7ZM14.08 3.68A5.27 5.27 0 0 0 15.29 0a5.36 5.36 0 0 0-3.46 1.75 5.02 5.02 0 0 0-1.24 3.54 4.43 4.43 0 0 0 3.49-1.61Z"/></svg>;
}
