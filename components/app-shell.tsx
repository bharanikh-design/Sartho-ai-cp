"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { OnboardingCarousel } from "@/components/onboarding-carousel";

type IconName =
  | "home"
  | "truth"
  | "analyse"
  | "resume"
  | "interview"
  | "applications"
  | "sparkles"
  | "shield";

type NavigationItem = {
  label: string;
  shortLabel: string;
  href: string;
  icon: IconName;
};

type AccountAction = "delete" | "wipe";

const navigation: NavigationItem[] = [
  { label: "Home", shortLabel: "Home", href: "/", icon: "home" },
  { label: "Career Profile", shortLabel: "Profile", href: "/career-truth", icon: "truth" },
  { label: "Analyse a Role", shortLabel: "Analyse", href: "/jobs", icon: "analyse" },
  { label: "Résumé Studio", shortLabel: "Résumé", href: "/resume-studio", icon: "resume" },
  { label: "Interview Prep", shortLabel: "Prepare", href: "/interview-prep", icon: "interview" },
  { label: "Applications", shortLabel: "Track", href: "/applications", icon: "applications" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountAction, setAccountAction] = useState<AccountAction | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const currentPage = navigation.find((item) => isActive(pathname, item.href))?.label ?? "Sartho";

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!loading && !session && pathname !== "/login") router.replace("/login");
  }, [loading, pathname, router, session]);

  useEffect(() => {
    setProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!profileOpen) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileOpen]);

  if (pathname === "/login") return <>{children}</>;

  if (loading || !session) {
    return (
      <main className="auth-loading" aria-live="polite">
        <span className="brand-mark" aria-hidden="true"><span>S</span></span>
        <div><strong>Opening your Sartho workspace</strong><small>Securing your session…</small></div>
      </main>
    );
  }

  const fullName = (session.user.user_metadata?.full_name as string | undefined) || session.user.email?.split("@")[0] || "User";
  const firstName = fullName.split(" ")[0];
  const initials = fullName.split(" ").slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "U";

  async function signOut() {
    setProfileOpen(false);
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  function openAccountAction(action: AccountAction) {
    setProfileOpen(false);
    setAccountAction(action);
    setConfirmation("");
    setAccountError(null);
  }

  function closeAccountAction() {
    if (accountBusy) return;
    setAccountAction(null);
    setConfirmation("");
    setAccountError(null);
  }

  async function confirmAccountAction() {
    if (!accountAction || accountBusy) return;
    const requiredPhrase = accountAction === "delete" ? "DELETE" : "WIPE";
    if (confirmation.trim().toUpperCase() !== requiredPhrase) return;

    setAccountBusy(true);
    setAccountError(null);
    const functionName = accountAction === "delete" ? "delete_my_account" : "wipe_my_data";
    const { error } = await supabase.rpc(functionName);

    if (error) {
      setAccountError(error.message);
      setAccountBusy(false);
      return;
    }

    if (accountAction === "delete") {
      await supabase.auth.signOut();
      router.replace("/login?account=deleted");
      router.refresh();
      return;
    }

    setAccountAction(null);
    setConfirmation("");
    setAccountBusy(false);
    router.replace("/");
    router.refresh();
  }

  const actionTitle = accountAction === "delete" ? "Delete Profile" : "Wipe Data";
  const requiredPhrase = accountAction === "delete" ? "DELETE" : "WIPE";

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      <aside className="desktop-rail glass-strong" aria-label="Primary navigation">
        <Link href="/" className="brand-lockup" aria-label="Sartho home">
          <span className="brand-mark" aria-hidden="true"><span>S</span></span>
          <span><strong>Sartho</strong><small>AI Career Copilot</small></span>
        </Link>

        <div className="rail-section-label">Workspace</div>
        <nav className="rail-nav">
          {navigation.map((item) => <NavItem key={item.href} item={item} active={isActive(pathname, item.href)} />)}
        </nav>

        <Link href="/jobs" className="rail-primary-action">
          <Icon name="sparkles" />
          <span>Analyse a new role</span>
          <span className="rail-action-arrow" aria-hidden="true">↗</span>
        </Link>

        <div className="rail-spacer" />
        <div className="privacy-card">
          <span className="privacy-icon"><Icon name="shield" /></span>
          <div><strong>Human-controlled</strong><p>Nothing is submitted without your approval.</p></div>
        </div>
        <div className="rail-footer"><span className="live-dot" /><span>Secure session</span><span>·</span><span>Evidence-led</span></div>
      </aside>

      <div className="app-stage">
        <header className="top-bar glass-soft">
          <div className="mobile-brand">
            <span className="brand-mark brand-mark-small" aria-hidden="true"><span>S</span></span>
            <span><strong>Sartho</strong><small>{currentPage}</small></span>
          </div>
          <div className="desktop-context">
            <span className="context-kicker">{getGreeting()}, {firstName}</span>
            <strong>{currentPage}</strong>
          </div>
          <div className="top-actions">
            <span className="sync-status"><span className="live-dot" /> Workspace ready</span>
            <div className="profile-menu-wrap" ref={profileMenuRef}>
              <button
                type="button"
                className={`avatar-button${profileOpen ? " is-open" : ""}`}
                onClick={() => setProfileOpen((current) => !current)}
                aria-label="Open profile menu"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
                aria-controls="profile-menu"
                title="Profile and account"
              >
                {initials}
              </button>

              {profileOpen ? (
                <div id="profile-menu" className="profile-menu" role="menu" aria-label="Profile and account">
                  <div className="profile-menu-identity"><strong>{fullName}</strong><span>{session.user.email}</span></div>
                  <div className="profile-menu-divider" />
                  <Link href="/career-truth" className="profile-menu-link" role="menuitem"><span>Career Profile</span><small aria-hidden="true">→</small></Link>
                  <button type="button" className="profile-menu-action" role="menuitem" onClick={() => void signOut()}><span>Log out</span><small>End this secure session</small></button>
                  <div className="profile-menu-divider" />
                  <button type="button" className="profile-menu-action danger" role="menuitem" onClick={() => openAccountAction("delete")}><span>Delete Profile</span><small>Delete account and all private data</small></button>
                  <button type="button" className="profile-menu-action danger" role="menuitem" onClick={() => openAccountAction("wipe")}><span>Wipe Data</span><small>Keep login, erase workspace data</small></button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="page-content">{children}</main>
      </div>

      <nav className="mobile-dock glass-strong" aria-label="Mobile navigation">
        {navigation.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} className={`dock-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
              <span className="dock-icon"><Icon name={item.icon} /></span><span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>

      <OnboardingCarousel user={session.user} />

      {accountAction ? (
        <div className="profile-protection-layer" role="dialog" aria-modal="true" aria-labelledby="account-action-title">
          <button type="button" className="profile-protection-backdrop" onClick={closeAccountAction} aria-label="Close account action" />
          <section className="profile-protection-dialog account-danger-dialog">
            <span className="profile-protection-kicker">Permanent action</span>
            <h2 id="account-action-title">{actionTitle}</h2>
            <p>
              {accountAction === "delete"
                ? "This permanently removes your Sartho login, Career Profile, evidence, jobs, analyses, résumé drafts and application history."
                : "This permanently removes your Career Profile, evidence, jobs, analyses, résumé drafts and application history, but keeps your Google login connected."}
            </p>
            <div className="profile-protection-note">This cannot be undone. Type <strong>{requiredPhrase}</strong> to confirm.</div>
            <label className="account-confirmation-field">
              <span>Confirmation</span>
              <input
                autoFocus
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={requiredPhrase}
                autoComplete="off"
              />
            </label>
            {accountError ? <div className="inline-error" role="alert">{accountError}</div> : null}
            <div className="profile-protection-actions">
              <button type="button" className="secondary-button" onClick={closeAccountAction} disabled={accountBusy}>Cancel</button>
              <button
                type="button"
                className="danger-button"
                onClick={() => void confirmAccountAction()}
                disabled={accountBusy || confirmation.trim().toUpperCase() !== requiredPhrase}
              >
                {accountBusy ? "Deleting…" : accountAction === "delete" ? "Delete everything" : "Wipe my data"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function NavItem({ item, active }: { item: NavigationItem; active: boolean }) {
  return (
    <Link href={item.href} className={`rail-link${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
      <span className="rail-link-icon"><Icon name={item.icon} /></span>
      <span>{item.label}</span>
      {active ? <span className="active-pip" aria-hidden="true" /> : null}
    </Link>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function Icon({ name }: { name: IconName }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

  switch (name) {
    case "home":
      return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5.5 9.5V21h13V9.5" /><path d="M9.5 21v-6h5v6" /></svg>;
    case "truth":
      return <svg {...common}><path d="M12 3 4.5 6v5.5c0 4.7 3.1 7.9 7.5 9.5 4.4-1.6 7.5-4.8 7.5-9.5V6L12 3Z" /><path d="m8.8 12 2.1 2.1 4.5-4.7" /></svg>;
    case "analyse":
      return <svg {...common}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /><path d="M8.5 11h5M11 8.5v5" /></svg>;
    case "resume":
      return <svg {...common}><path d="M7 3.5h7l3 3V20.5H7z" /><path d="M14 3.5v4h4" /><path d="M9.5 11h5M9.5 14h5M9.5 17h3" /></svg>;
    case "interview":
      return <svg {...common}><path d="M5 5.5h14v10H9l-4 3v-13Z" /><path d="M9 9h6M9 12h4" /></svg>;
    case "applications":
      return <svg {...common}><rect x="4" y="3.5" width="16" height="17" rx="3" /><path d="M8 8h8M8 12h8M8 16h4" /></svg>;
    case "sparkles":
      return <svg {...common}><path d="m12 3 1.1 3.1L16 7.2l-2.9 1.1L12 11.5l-1.1-3.2L8 7.2l2.9-1.1L12 3Z" /><path d="m18 13 .8 2.2L21 16l-2.2.8L18 19l-.8-2.2L15 16l2.2-.8L18 13Z" /><path d="m6 14 .7 1.8 1.8.7-1.8.7L6 19l-.7-1.8-1.8-.7 1.8-.7L6 14Z" /></svg>;
    case "shield":
      return <svg {...common}><path d="M12 3 5 6v5c0 4.4 2.9 7.4 7 9 4.1-1.6 7-4.6 7-9V6l-7-3Z" /><path d="M9.5 12.2 11 13.7l3.7-4" /></svg>;
  }
}
