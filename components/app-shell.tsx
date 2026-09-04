"use client";

import Image from "next/image";
import Link from "next/link";
import sarthoIcon from "@/sartho.png";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { OnboardingCarousel } from "@/components/onboarding-carousel";
import {
  getPageLabel,
  getMobileNavigation,
  getNavigationForPath,
  isNavigationItemActive,
  type NavigationIconName,
  type NavigationItem,
} from "@/lib/navigation";

type AccountAction = "delete" | "wipe";
type JourneyStatus = {
  activated: boolean;
  progress: number;
  currentHref: string;
  currentLabel: string;
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);

  const [profileOpen, setProfileOpen] = useState(false);
  const [accountPanelOpen, setAccountPanelOpen] = useState(false);
  const [accountAction, setAccountAction] = useState<AccountAction | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [journeyStatus, setJourneyStatus] = useState<JourneyStatus | null>(null);
  const currentPage = getPageLabel(pathname);
  const activated = journeyStatus?.activated ?? false;
  const navigation = getNavigationForPath(activated, pathname);
  const mobileNavigation = getMobileNavigation(activated);

  useEffect(() => {
    // The inline script in the document head already applied this before paint;
    // mirror it into React so the switch renders in the right position.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem("sartho-theme-v2", next);
    } catch {
      // Private browsing can refuse storage; the theme still applies this session.
    }
  }

  const refreshJourneyStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/journey/status", { cache: "no-store" });
      if (!response.ok) return;
      setJourneyStatus(await response.json() as JourneyStatus);
    } catch {
      // Navigation remains in the safe onboarding state if status cannot load.
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
      if (data.session) void refreshJourneyStatus();
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      if (nextSession) void refreshJourneyStatus();
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [refreshJourneyStatus, supabase]);

  useEffect(() => {
    // Determine the scroll state
    const handleScroll = () => setScrolled(window.scrollY > 0);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    
    // Auto-dismiss welcome toast after 4 seconds
    const timer = setTimeout(() => setShowWelcome(false), 4000);
    
    return () => {
      window.removeEventListener("scroll", handleScroll);
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    window.addEventListener("sartho:journey-changed", refreshJourneyStatus);
    return () => window.removeEventListener("sartho:journey-changed", refreshJourneyStatus);
  }, [refreshJourneyStatus]);

  useEffect(() => {
    if (!loading && !session && pathname !== "/login") router.replace("/login");
  }, [loading, pathname, router, session]);

  useEffect(() => {
    // Close the profile menu when the route changes — synchronising UI with
    // navigation is a valid effect, but the react-hooks rule flags the setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        <Image className="brand-mark" src={sarthoIcon} alt="" width={176} height={176} quality={95} priority />
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
    setAccountPanelOpen(false);
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

  function openAccountPanel() {
    setProfileOpen(false);
    setAccountPanelOpen(true);
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
          <Image className="brand-mark" src={sarthoIcon} alt="" width={176} height={176} quality={95} priority />
          <span><strong>Sartho</strong><small>AI Career Copilot</small></span>
        </Link>

        <div className="rail-section-label">Your career</div>
        <nav className="rail-nav">
          {navigation.map((item) => (
            <NavItem key={item.href} item={item} active={isNavigationItemActive(pathname, item.href)} />
          ))}
        </nav>

        <div className="rail-spacer" />
        <Link href="/journey" className="privacy-card journey-summary-card" aria-label="Open career foundation status">
          <span className="privacy-icon"><Icon name={activated ? "shield" : "journey"} /></span>
          <div>
            <strong>{activated ? "Career foundation ready" : `Career foundation · ${journeyStatus?.progress ?? "—"}%`}</strong>
            <p>{activated ? "Review it whenever your goals change." : `Next: ${journeyStatus?.currentLabel ?? "Loading your next step"}`}</p>
            <span className="journey-card-progress" aria-hidden="true"><i style={{ width: `${journeyStatus?.progress ?? 0}%` }} /></span>
          </div>
        </Link>
        <div className="rail-footer"><span className="live-dot" /><span>Secure session</span><span>·</span><span>Profile-grounded</span></div>
      </aside>

      <div className="app-stage">
        <header className="top-bar glass-soft">
          <div className="mobile-brand">
            <Image className="brand-mark brand-mark-small" src={sarthoIcon} alt="" width={144} height={144} quality={95} />
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
                  <div className="profile-menu-identity">
                    <span className="profile-menu-avatar" aria-hidden="true">{initials}</span>
                    <span className="profile-menu-person"><strong>{fullName}</strong><small>{session.user.email}</small></span>
                  </div>
                  <div className="profile-menu-divider" />
                  <div className="theme-row">
                    <span><strong>Appearance</strong><small>{theme === "dark" ? "Dark theme" : "Light theme"}</small></span>
                    <button
                      type="button"
                      className="theme-switch"
                      data-on={theme === "light"}
                      role="menuitemcheckbox"
                      aria-checked={theme === "light"}
                      aria-label="Switch between dark and light theme"
                      onClick={toggleTheme}
                    />
                  </div>
                  <div className="profile-menu-divider" />
                  <Link href="/career-truth" className="profile-menu-link" role="menuitem"><span><strong>Career Profile</strong><small>Review your evidence and positioning</small></span><b aria-hidden="true">→</b></Link>
                  <button type="button" className="profile-menu-action" role="menuitem" onClick={openAccountPanel}><span><strong>Data & privacy</strong><small>Manage or remove your information</small></span><b aria-hidden="true">→</b></button>
                  <button type="button" className="profile-menu-action profile-menu-signout" role="menuitem" onClick={() => void signOut()}><span><strong>Log out</strong><small>End this secure session</small></span></button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {session && showWelcome ? (
          <div style={{ position: "fixed", top: "20px", left: "50%", transform: "translateX(-50%)", background: "#0d402b", color: "white", padding: "12px 24px", borderRadius: "100px", zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", animation: "fadeIn 0.3s ease-out", fontSize: "0.875rem", fontWeight: 500 }}>
            <span style={{ color: "#6bcf93" }}>✦</span> 3 new ServiceNow Manager roles matching your Search Brief were posted today.
          </div>
        ) : null}

        <main className="page-content">{children}</main>
      </div>

      <nav className="mobile-dock glass-strong" aria-label="Mobile navigation" style={{ gridTemplateColumns: `repeat(${mobileNavigation.length}, minmax(0, 1fr))` }}>
        {mobileNavigation.map((item) => {
          const active = isNavigationItemActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href} className={`dock-item${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
              <span className="dock-icon"><Icon name={item.icon} /></span><span>{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>

      <OnboardingCarousel user={session.user} />

      {accountPanelOpen ? (
        <div className="profile-protection-layer" role="dialog" aria-modal="true" aria-labelledby="account-panel-title">
          <button type="button" className="profile-protection-backdrop" onClick={() => setAccountPanelOpen(false)} aria-label="Close data and privacy settings" />
          <section className="profile-protection-dialog account-privacy-dialog">
            <div className="account-dialog-heading">
              <div><span className="profile-protection-kicker">Account settings</span><h2 id="account-panel-title">Data & privacy</h2></div>
              <button type="button" className="account-dialog-close" onClick={() => setAccountPanelOpen(false)} aria-label="Close data and privacy settings">×</button>
            </div>
            <p>Your career information stays private to your account. Choose what you want to keep or remove.</p>
            <div className="account-privacy-options">
              <button type="button" onClick={() => openAccountAction("wipe")}>
                <span><strong>Clear workspace data</strong><small>Remove your Career Profile, jobs and applications while keeping your login.</small></span><b>Review →</b>
              </button>
              <button type="button" className="is-danger" onClick={() => openAccountAction("delete")}>
                <span><strong>Delete account</strong><small>Permanently remove your login and all information associated with it.</small></span><b>Review →</b>
              </button>
            </div>
            <button type="button" className="secondary-button account-dialog-done" onClick={() => setAccountPanelOpen(false)}>Done</button>
          </section>
        </div>
      ) : null}

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
    <Link
      href={item.href}
      className={`rail-link${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      title={item.purpose}
    >
      <span className="rail-link-icon"><Icon name={item.icon} /></span>
      <span>{item.label}</span>
      {active ? <span className="active-pip" aria-hidden="true" /> : null}
    </Link>
  );
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function Icon({ name }: { name: NavigationIconName }) {
  const common = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

  switch (name) {
    case "home":
      return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5.5 9.5V21h13V9.5" /><path d="M9.5 21v-6h5v6" /></svg>;
    case "journey":
      return <svg {...common}><circle cx="5" cy="18" r="2" /><circle cx="12" cy="6" r="2" /><circle cx="19" cy="15" r="2" /><path d="M6.5 16.7 10.8 7.8M13.7 7.3l3.7 6.3" /></svg>;
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
    case "shield":
      return <svg {...common}><path d="M12 3 5 6v5c0 4.4 2.9 7.4 7 9 4.1-1.6 7-4.6 7-9V6l-7-3Z" /><path d="M9.5 12.2 11 13.7l3.7-4" /></svg>;
  }
}
