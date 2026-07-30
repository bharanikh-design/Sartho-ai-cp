"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const slides = [
  {
    eyebrow: "Turn experience into possibility",
    title: "Your career story deserves to open the right doors.",
    description: "Bring together the roles, achievements and strengths that define you. Sartho creates a trusted foundation so every recommendation reflects what you have genuinely accomplished.",
    badge: "Available now",
    visual: "profile",
  },
  {
    eyebrow: "Know where you truly belong",
    title: "See the opportunity behind the job description.",
    description: "Sartho looks beyond keywords to understand the role, the recruiter’s real priorities, your strongest advantages and the gaps that deserve an honest decision.",
    badge: "Available now",
    visual: "match",
  },
  {
    eyebrow: "Stand out without pretending",
    title: "Tell the version of your story that deserves to be seen.",
    description: "Résumé Studio shows what to emphasise, move, rewrite or leave out — always linked to evidence, always under your control and never based on invented claims.",
    badge: "Foundation ready",
    visual: "resume",
  },
  {
    eyebrow: "Be ready when the moment arrives",
    title: "Walk into every conversation with clarity and confidence.",
    description: "Interview Prep turns the role and your real experience into likely questions, stronger answers and the stories worth carrying into the room.",
    badge: "Foundation ready",
    visual: "journey",
  },
];

export default function WelcomePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [index, setIndex] = useState(0);
  const [name, setName] = useState("there");
  const [ready, setReady] = useState(false);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadWelcomeState() {
      const replay = new URLSearchParams(window.location.search).get("replay") === "1";
      const { data, error } = await supabase.auth.getUser();

      if (!active) return;

      if (error || !data.user) {
        router.replace("/login");
        return;
      }

      const fullName = data.user.user_metadata?.full_name as string | undefined;
      const emailName = data.user.email?.split("@")[0];
      setName(fullName?.split(" ")[0] || emailName || "there");

      const completed = data.user.user_metadata?.sartho_onboarding_complete === true;
      if (completed && !replay) {
        router.replace("/");
        return;
      }

      setReady(true);
    }

    void loadWelcomeState();
    return () => {
      active = false;
    };
  }, [router, supabase]);

  const slide = slides[index];
  const isLast = index === slides.length - 1;

  async function finish() {
    setFinishing(true);
    const { error } = await supabase.auth.updateUser({
      data: { sartho_onboarding_complete: true },
    });

    if (error) {
      setFinishing(false);
      return;
    }

    window.localStorage.setItem("sartho-tour-pending", "true");
    router.push("/");
    router.refresh();
  }

  if (!ready) {
    return (
      <main className="auth-loading" aria-live="polite">
        <span className="brand-mark" aria-hidden="true"><span>S</span></span>
        <div><strong>Preparing your Sartho journey</strong><small>Personalising your first experience…</small></div>
      </main>
    );
  }

  return (
    <main className="welcome-page">
      <div className="welcome-ambient welcome-ambient-one" aria-hidden="true" />
      <div className="welcome-ambient welcome-ambient-two" aria-hidden="true" />

      <header className="welcome-header">
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true"><span>S</span></span>
          <div><strong>Sartho AI</strong><small>Your career, intelligently guided.</small></div>
        </div>
        <button type="button" className="ghost-button" onClick={finish} disabled={finishing}>Skip tour</button>
      </header>

      <section className="welcome-stage glass-card">
        <div className="welcome-copy" key={`copy-${index}`}>
          <span className="welcome-greeting">Welcome, {name}.</span>
          <span className="page-eyebrow">{slide.eyebrow}</span>
          <h1>{slide.title}</h1>
          <p>{slide.description}</p>
          <span className={`welcome-badge ${slide.badge === "Available now" ? "is-live" : ""}`}>{slide.badge}</span>
        </div>

        <div className="welcome-visual" key={`visual-${index}`} aria-hidden="true">
          <FeatureVisual kind={slide.visual} />
        </div>
      </section>

      <footer className="welcome-controls">
        <button type="button" className="secondary-button" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={index === 0 || finishing}>Back</button>
        <div className="welcome-progress" aria-label={`Step ${index + 1} of ${slides.length}`}>
          {slides.map((item, itemIndex) => (
            <button key={item.title} type="button" className={itemIndex === index ? "is-active" : ""} onClick={() => setIndex(itemIndex)} aria-label={`Go to step ${itemIndex + 1}`} />
          ))}
        </div>
        <button type="button" className="primary-button" onClick={() => isLast ? void finish() : setIndex((current) => current + 1)} disabled={finishing}>
          {finishing ? "Opening Sartho…" : isLast ? "Begin my journey" : "Next"}<span aria-hidden="true">→</span>
        </button>
      </footer>

      <div className="journey-strip" aria-label="Sartho journey">
        {['Discover', 'Align', 'Stand out', 'Prepare', 'Land it'].map((item, itemIndex) => (
          <div key={item} className={itemIndex <= index + 1 ? "is-active" : ""}>
            <span>{itemIndex + 1}</span><strong>{item}</strong>{itemIndex < 4 ? <i /> : null}
          </div>
        ))}
      </div>
    </main>
  );
}

function FeatureVisual({ kind }: { kind: string }) {
  if (kind === "profile") {
    return (
      <div className="feature-device">
        <div className="feature-device-bar"><i /><i /><i /></div>
        <div className="profile-demo-row"><span>✓</span><div><strong>Transformation leadership</strong><small>Approved evidence · High confidence</small></div></div>
        <div className="profile-demo-row"><span>✓</span><div><strong>Complex programme delivery</strong><small>Approved evidence · High confidence</small></div></div>
        <div className="profile-demo-row is-pending"><span>?</span><div><strong>Operational readiness ownership</strong><small>Review before Sartho may use it</small></div></div>
      </div>
    );
  }

  if (kind === "match") {
    return (
      <div className="feature-device match-demo">
        <div className="match-score"><strong>88%</strong><span>Strong fit</span></div>
        <div className="match-bars">
          <label>Required qualifications<i><b style={{ width: '88%' }} /></i></label>
          <label>Leadership alignment<i><b style={{ width: '92%' }} /></i></label>
          <label>Evidence confidence<i><b style={{ width: '84%' }} /></i></label>
        </div>
        <span className="match-confidence">Evidence-backed assessment</span>
      </div>
    );
  }

  if (kind === "resume") {
    return (
      <div className="feature-device resume-demo">
        <div className="resume-sheet">
          <span className="resume-line strong" /><span className="resume-line" /><span className="resume-line short" />
          <div className="resume-change"><del>Managed transformation activities</del><ins>Led a complex multi-country transformation programme</ins></div>
          <span className="resume-line" /><span className="resume-line medium" />
        </div>
        <div className="resume-proof">Evidence linked</div>
      </div>
    );
  }

  return (
    <div className="feature-device journey-demo">
      {['Likely questions', 'Career story selected', 'Answer strengthened', 'Confidence built'].map((item, itemIndex) => (
        <div key={item} className="journey-demo-row"><span>{itemIndex + 1}</span><strong>{item}</strong><i /></div>
      ))}
    </div>
  );
}
