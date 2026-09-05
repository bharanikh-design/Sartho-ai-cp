"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/*
 * Real search, on demand. Presses the brief against the jobs provider and shows
 * what comes back, each role scored against approved evidence. Saving a role
 * routes through the same /api/jobs the manual analyser uses, so a searched role
 * and a pasted one are identical once in the pipeline. When no provider is
 * configured this says so plainly — it never shows a placeholder result.
 */

type SearchResult = {
  title: string;
  employer: string | null;
  location: string | null;
  url: string;
  salary: string | null;
  postedAt: string | null;
  source: string;
  description: string;
  overallMatch: number;
  recommendation: "apply" | "review" | "skip";
  matchedSkills: string[];
  titleFit?: number;
  requirementCoverage?: number;
  closestTitle?: string | null;
  closestIsHeld?: boolean;
  requirementsRead?: number;
  missingRequirements?: string[];
};

/* What the server actually searched — echoed back so nobody has to guess. */
type SearchCriteria = import("@/lib/jobs/run-search").SearchCriteria;

const recTone: Record<SearchResult["recommendation"], string> = {
  apply: "#6bcf93",
  review: "#e0b061",
  skip: "#e5917a",
};

export function JobSearchPanel({
  autoRun = false,
  initialResults = [],
  initialCriteria = null,
  searchedAt = null,
}: {
  autoRun?: boolean;
  /** The last stored search, read on the server. */
  initialResults?: SearchResult[];
  initialCriteria?: SearchCriteria | null;
  searchedAt?: string | null;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "not_configured" | "no_targets">(
    initialResults.length ? "ready" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>(initialResults);
  const [criteria, setCriteria] = useState<SearchCriteria | null>(initialCriteria);
  const [lastRun, setLastRun] = useState<string | null>(searchedAt);
  const [savingUrl, setSavingUrl] = useState<string | null>(null);
  const [savedUrls, setSavedUrls] = useState<string[]>([]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showWeak, setShowWeak] = useState(false);
  /* Six to a page. A laundry list is not a shortlist. */
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 6;

  async function runSearch() {
    setStatus("loading");
    setError(null);
    setSaveError(null);
    // Clear the previous run outright. Leaving old rows on screen while new
    // ones arrive was showing two different searches at once.
    setResults([]);
    setCriteria(null);
    setShowWeak(false);
    setPage(0);
    try {
      const response = await fetch("/api/jobs/search", { method: "POST" });
      const data = await response.json() as { results?: SearchResult[]; criteria?: SearchCriteria; error?: string; code?: string };
      if (!response.ok) {
        if (data.code === "not_configured") { setStatus("not_configured"); return; }
        if (data.code === "no_targets") { setStatus("no_targets"); setError(data.error ?? null); return; }
        throw new Error(data.error ?? "Search failed.");
      }
      setResults(data.results ?? []);
      setCriteria(data.criteria ?? null);
      setLastRun(new Date().toISOString());
      setPage(0);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Search failed.");
      setStatus("error");
    }
  }

  /*
   * The matches are this page's content, so they load on arrival — but the last
   * search is stored, so arriving is normally a read. Only someone who has
   * never searched triggers a live one; "Search again" always runs fresh.
   */
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoRun || autoRan.current || initialResults.length) return;
    autoRan.current = true;
    void runSearch();
    // runSearch is a stable in-component handler; the ref keeps this to one run.
  }, [autoRun, initialResults.length]);

  async function save(result: SearchResult) {
    if (savingUrl) return;
    setSavingUrl(result.url);
    setSaveError(null);
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: result.title,
          employer: result.employer ?? "",
          location: result.location ?? "",
          sourceUrl: result.url,
          description: result.description,
        }),
      });
      const data = await response.json() as { job?: unknown; error?: string };
      if (!response.ok || !data.job) throw new Error(data.error ?? "Could not save this role.");
      setSavedUrls((urls) => [...urls, result.url]);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "Could not save this role.");
    } finally {
      setSavingUrl(null);
    }
  }

  const renderResult = (result: SearchResult) => {
    const saved = savedUrls.includes(result.url);
    return (
      <article className="application-row" key={result.url} style={{ alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {result.employer ?? "Employer not listed"}{result.location ? ` · ${result.location}` : ""}
          </span>
          <strong style={{ display: "block", fontSize: "1.0625rem", margin: "2px 0" }}>{result.title}</strong>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap", margin: "6px 0" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: recTone[result.recommendation], border: `1px solid ${recTone[result.recommendation]}55`, background: `${recTone[result.recommendation]}18`, padding: "3px 10px", borderRadius: "100px" }}>{result.recommendation}</span>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{result.overallMatch}% match</span>
            {result.salary ? <span style={{ fontSize: "0.8125rem", color: "var(--text-tertiary)" }}>{result.salary}</span> : null}
            <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>{result.source}</span>
          </div>
          {/* The score, in its parts — a bare percentage explains nothing. */}
          {typeof result.titleFit === "number" ? (
            <p className="match-reason">
              {/*
                * This said "matches your Management Consultant experience"
                * about a role the person had never held — Management Consultant
                * was a target they had typed on Career Direction. A target is a
                * wish; saying it back as experience is the product lying.
                */}
              {result.titleFit >= 50 && result.closestTitle
                ? result.closestIsHeld
                  ? <>Title matches your <strong>{result.closestTitle}</strong> experience ({result.titleFit}%)</>
                  : <>Title matches <strong>{result.closestTitle}</strong>, a role you are targeting ({result.titleFit}%)</>
                : <>Title is unlike anything in your history</>}
              {/*
                * A percentage with no denominator is how two adverts as unalike
                * as ESG due diligence and gym memberships both read "100%".
                */}
              {typeof result.requirementCoverage === "number" && result.requirementsRead
                ? <> · evidences <strong>{result.requirementCoverage}%</strong> of the {result.requirementsRead} requirement{result.requirementsRead === 1 ? "" : "s"} legible in this advert</>
                : null}
            </p>
          ) : null}
          {result.matchedSkills.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {result.matchedSkills.map((skill) => (
                <span key={skill} style={{ fontSize: "0.7rem", color: "#6bcf93", background: "rgba(107,207,147,0.1)", border: "1px solid rgba(107,207,147,0.25)", padding: "3px 8px", borderRadius: "4px" }}>{skill}</span>
              ))}
            </div>
          ) : null}
          {result.missingRequirements?.length ? (
            <p className="match-gap">Not yet evidenced: {result.missingRequirements.join(", ")}</p>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "none" }}>
          {saved ? (
            <Link href="/applications" className="secondary-button" style={{ whiteSpace: "nowrap" }}>Saved ✓</Link>
          ) : (
            <button type="button" className="primary-button" onClick={() => void save(result)} disabled={savingUrl === result.url} style={{ whiteSpace: "nowrap" }}>
              {savingUrl === result.url ? "Saving…" : "Save to pipeline"}
            </button>
          )}
          <a href={result.url} target="_blank" rel="noreferrer" className="secondary-button" style={{ whiteSpace: "nowrap", textAlign: "center" }}>View ↗</a>
        </div>
      </article>
    );
  };

  // De-duplicate near-identical reposts (same title + employer), then split into
  // strong matches (worth acting on) and weaker ones (collapsed by default).
  const seen = new Set<string>();
  const unique = results.filter((result) => {
    const key = `${result.title}|${result.employer ?? ""}`.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const strong = unique.filter((result) => result.recommendation !== "skip");
  const weak = unique.filter((result) => result.recommendation === "skip");
  const primary = strong.length ? strong : weak.slice(0, 3);
  const collapsed = strong.length ? weak : weak.slice(3);

  const pageCount = Math.max(1, Math.ceil(primary.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = primary.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="glass-card content-card" id="find-roles">
      <div className="card-header">
        <div>
          <h2 className="section-heading">Matching roles</h2>
          <p className="section-subtitle">
            Live listings for your target roles, each scored against your approved evidence.
            {lastRun ? ` Last searched ${new Date(lastRun).toLocaleString()}.` : ""}
          </p>
        </div>
        <button type="button" className="primary-button" onClick={() => void runSearch()} disabled={status === "loading"}>
          {status === "loading" ? "Searching…" : status === "ready" ? "Search again" : "Search now"}
        </button>
      </div>

      {status === "not_configured" ? (
        <div className="empty-inline-state">
          Live search isn&apos;t connected yet. Add a jobs provider key — <code>JSEARCH_RAPIDAPI_KEY</code> (Google for Jobs) or <code>ADZUNA_APP_ID</code> + <code>ADZUNA_APP_KEY</code> — in the deployment settings, then search here. Until then, add roles by hand on <Link href="/applications#add-role">Applications</Link>.
        </div>
      ) : null}

      {status === "no_targets" ? (
        <div className="empty-inline-state">
          {error ?? "Choose your target roles first."} <Link href="/career-direction#priorities">Set them in Career Direction →</Link>
        </div>
      ) : null}

      {status === "error" ? <div className="inline-error" role="alert">{error}</div> : null}

      {status === "ready" && criteria ? (
        <p className="search-field-hint" style={{ marginTop: "12px" }}>
          Searched <strong>{criteria.countryName}</strong>
          {criteria.locations.length ? <> · {criteria.locations.join(", ")}</> : <> · nationwide</>}
          {criteria.broadened ? <> (few strong matches there, so the rest of {criteria.countryName} was searched too)</> : null}
          {criteria.remoteOnly ? <> · remote only</> : null}
          <> · roles: {criteria.roles.join(", ")}</>
          {criteria.companies.length ? <> · companies: {criteria.companies.join(", ")}</> : null}
          {criteria.providers.length ? <> · via {criteria.providers.join(" + ")}</> : null}
          {criteria.countrySource === "default" ? <> · <Link href="#country">choose your country</Link> to search the right market</> : null}
          {criteria.tooSenior ? <> · {criteria.tooSenior} hidden as too senior for your experience</> : null}
          {/*
            * Said out loud, because a filter nobody can see is indistinguishable
            * from a search that found nothing.
            */}
          {criteria.offFamily ? (
            <> · {criteria.offFamily} hidden as a different line of work
              {criteria.families.length ? <> from {criteria.families.join(", ")}</> : null}
              {" "}(<Link href="/career-direction#priorities">change your target roles</Link>)
            </>
          ) : null}
          {criteria.queriesSkipped > 0 ? <> · {criteria.queriesSkipped} queries skipped (time limit)</> : null}
        </p>
      ) : null}

      {status === "loading" ? (
        <div className="application-list" style={{ marginTop: "12px" }} aria-label="Searching live listings">
          {[1, 2, 3].map((item) => <div key={item} className="search-result-skeleton" />)}
        </div>
      ) : null}

      {status === "idle" && !autoRun ? (
        <div className="empty-inline-state">Choose a country and save your criteria above, then Sartho searches live listings here.</div>
      ) : null}

      {status === "ready" && !results.length ? (
        <div className="empty-inline-state">No live matches for your brief right now. Try broadening your cities or target roles.</div>
      ) : null}

      {saveError ? <div className="inline-error" role="alert">{saveError}</div> : null}

      {unique.length ? (
        <>
          {!strong.length ? (
            <div className="empty-inline-state">No strong matches against your evidence yet — here are the closest. Adding more approved evidence, or refining your target roles, sharpens these.</div>
          ) : null}
          <div className="application-list" style={{ marginTop: "8px" }}>
            {pageItems.map(renderResult)}
          </div>
          {pageCount > 1 ? (
            <nav className="result-pager" aria-label="Result pages">
              <button type="button" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={currentPage === 0}>‹ Previous</button>
              <span>{currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, primary.length)} of {primary.length}</span>
              <button type="button" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={currentPage >= pageCount - 1}>Next ›</button>
            </nav>
          ) : null}
          {collapsed.length ? (
            <>
              <button type="button" className="secondary-button" onClick={() => setShowWeak((value) => !value)} style={{ marginTop: "12px" }}>
                {showWeak ? "Hide weaker matches" : `Show ${collapsed.length} weaker match${collapsed.length === 1 ? "" : "es"}`}
              </button>
              {showWeak ? (
                <div className="application-list" style={{ marginTop: "8px", opacity: 0.7 }}>
                  {collapsed.map(renderResult)}
                </div>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
