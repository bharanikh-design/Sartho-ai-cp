import Link from "next/link";

const links = [
  ["Overview", "/"],
  ["Career Truth", "/career-truth"],
  ["Analyse a Job", "/jobs"],
  ["Applications", "/applications"],
];

export function Sidebar() {
  return (
    <aside className="panel h-fit p-4 lg:sticky lg:top-6">
      <div className="px-3 py-4">
        <div className="text-xl font-semibold tracking-tight">Sartho</div>
        <div className="muted mt-1 text-xs">Your career, intelligently guided.</div>
      </div>
      <nav className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:mt-4 lg:grid-cols-1">
        {links.map(([label, href]) => (
          <Link key={href} href={href} className="rounded-2xl px-3 py-3 text-sm transition hover:bg-white/10">
            {label}
          </Link>
        ))}
      </nav>
      <div className="muted mt-6 border-t border-white/10 px-3 pt-4 text-xs lg:mt-8">
        Private alpha · No unattended applications
      </div>
    </aside>
  );
}
