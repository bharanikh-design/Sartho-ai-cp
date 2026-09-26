import Image from "next/image";
import Link from "next/link";
import sarthoIcon from "@/sartho.png";

/*
 * The front-door navigation.
 *
 * The brand lockup stays whole — mark, wordmark and tagline together — because
 * the front door is where identity should be most complete. Only two links, and
 * both point at pages that actually exist: the real /extension and /contact.
 * "What it does" and the "Get Started" button were removed at the owner's
 * request — the one they anchored to was gone, and the sign-in card is the real
 * call to action. Two short links fit inline at every width, so there is no
 * disclosure menu to hide them behind.
 */

const LINKS = [
  { href: "/extension", label: "Extension" },
  { href: "/contact", label: "Contact" },
] as const;

export function Navbar() {
  return (
    <header className="fd-nav">
      <Link href="/" className="fd-brand" aria-label="Sartho home">
        <Image className="fd-brand-mark" src={sarthoIcon} alt="" width={256} height={256} quality={95} priority />
        <span className="fd-brand-text">
          <strong>Sartho</strong>
          <small>Your Career CoPilot</small>
        </span>
      </Link>

      <nav className="fd-nav-links" aria-label="Primary">
        {LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="fd-nav-link">
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
