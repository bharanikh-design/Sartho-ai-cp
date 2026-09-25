"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import sarthoIcon from "@/sartho.png";

/*
 * The front-door navigation.
 *
 * The brand lockup stays whole — mark, wordmark and tagline together — because
 * the front door is where identity should be most complete. Every link points at
 * something that actually exists: the "what it does" section below, the real
 * /extension and /contact pages. No invented About/Careers routes, because a
 * dead link on the first screen is the first thing that reads as unfinished.
 *
 * On a narrow screen the links collapse into a disclosure so the way in — Get
 * Started — is never crowded off the bar.
 */

type NavLink = { href: string; label: string };

const LINKS: NavLink[] = [
  { href: "/#what-it-does", label: "What it does" },
  { href: "/extension", label: "Extension" },
  { href: "/contact", label: "Contact" },
];

export function Navbar({ onGetStarted }: { onGetStarted: () => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const closeOnOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOnOutside);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOnOutside);
    };
  }, [open]);

  return (
    <header className="fd-nav" ref={menuRef}>
      <Link href="/" className="fd-brand" aria-label="Sartho home">
        <Image className="fd-brand-mark" src={sarthoIcon} alt="" width={256} height={256} quality={95} priority />
        <span className="fd-brand-text">
          <strong>Sartho</strong>
          <small>Your Career CoPilot</small>
        </span>
      </Link>

      <nav className={`fd-nav-links${open ? " is-open" : ""}`} aria-label="Primary">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="fd-nav-link" onClick={() => setOpen(false)}>
            {link.label}
          </Link>
        ))}
        <button
          type="button"
          className="fd-cta"
          onClick={() => {
            setOpen(false);
            onGetStarted();
          }}
        >
          Get Started
          <span className="fd-cta-arrow" aria-hidden="true">→</span>
        </button>
      </nav>

      <button
        type="button"
        className="fd-nav-toggle"
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="fd-nav-toggle-bar" />
        <span className="fd-nav-toggle-bar" />
      </button>
    </header>
  );
}
