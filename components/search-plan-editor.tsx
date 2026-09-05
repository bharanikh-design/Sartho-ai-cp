"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TargetLaneRecord } from "@/lib/types";
import type { SearchSourcePreference } from "@/lib/data/search";
import { JOB_MARKETS, cityOptions, countryName } from "@/lib/jobs/countries";
import { KNOWN_EMPLOYERS } from "@/lib/jobs/employers";
import { ChipCombobox } from "@/components/chip-combobox";

import { DEFAULT_JOB_SOURCES } from "@/lib/config/job-sources";

export type SearchSource = SearchSourcePreference;

/*
 * The search criteria as four follow-up questions in one card, in the order the
 * engine applies them: country → cities → employers → work model. Each question
 * appears once the one before it is answered. The page's real content — the
 * matching roles — sits directly below, so this card stays short.
 */

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function SearchPlanEditor({
  initialSources,
  initialCountry,
  inferredCountry,
  initialLocations,
  initialCompanies,
  initialRemote,
  targetLanes,
  movedCompanies = 0,
}: {
  initialSources: SearchSource[];
  initialCountry: string | null;
  inferredCountry: string | null;
  initialLocations: string[];
  initialCompanies: string[];
  initialRemote: string;
  targetLanes: TargetLaneRecord[];
  /** Employers found in the saved cities list and moved across on load. */
  movedCompanies?: number;
}) {
  const router = useRouter();
  const [sources] = useState<SearchSource[]>(initialSources.length ? initialSources : DEFAULT_JOB_SOURCES);
  const [country, setCountry] = useState(initialCountry ?? inferredCountry ?? "");
  const [locations, setLocations] = useState(initialLocations);
  const [companies, setCompanies] = useState(initialCompanies);
  const [remote, setRemote] = useState(initialRemote);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // A country read from the résumé but never saved still counts as a change, as
  // do employers moved out of the cities list: both need a save to take effect.
  const hasChanges = useMemo(() => {
    if (country !== (initialCountry ?? "")) return true;
    if (movedCompanies > 0) return true;
    if (remote !== initialRemote) return true;
    if (!sameList(locations, initialLocations)) return true;
    if (!sameList(companies, initialCompanies)) return true;
    return false;
  }, [country, movedCompanies, remote, locations, companies, initialCountry, initialRemote, initialLocations, initialCompanies]);

  async function save() {
    if (!hasChanges) return;
    setStatus("saving");
    const response = await fetch("/api/search-plan", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        country: country || null,
        sources: sources.some((source) => source.active) ? sources : DEFAULT_JOB_SOURCES,
        targetLocations: locations,
        targetCompanies: companies,
        remotePreference: remote || "Flexible",
      }),
    });
    setStatus(response.ok ? "saved" : "error");
    if (response.ok) {
      window.dispatchEvent(new Event("sartho:journey-changed"));
      router.refresh();
    }
  }

  const marketName = countryName(country);
  const cities = useMemo(() => cityOptions(country), [country]);

  return (
    <section className="glass-card search-criteria" id="criteria" aria-label="Search criteria">
      <div className="search-criteria-roles">
        <span>Searching for</span>
        <strong>{targetLanes.length ? targetLanes.map((lane) => lane.name).join(" · ") : "No target roles yet"}</strong>
        <Link href="/career-direction#priorities">Edit roles →</Link>
      </div>

      <div className="search-criteria-row" id="country">
        <label htmlFor="criteria-country">
          <strong>Where do you want to work?</strong>
          <small>{!country ? "Choose the job market. It may not be where you live today." : !initialCountry && inferredCountry === country ? "Read from your résumé — change it if you are targeting elsewhere." : "The job market every search is scoped to."}</small>
        </label>
        <select id="criteria-country" className="search-country-select" value={country} onChange={(event) => { setCountry(event.target.value); setLocations([]); }}>
          <option value="">Choose a country…</option>
          {JOB_MARKETS.map((market) => <option key={market.code} value={market.code}>{market.name}</option>)}
        </select>
      </div>

      {country ? (
        <>
          <div className="search-criteria-row" id="geography">
            <label htmlFor="criteria-cities">
              <strong>Which cities in {marketName}?</strong>
              <small>Start typing to pick. Leave empty for anywhere in {marketName}; a thin city widens to the rest automatically.</small>
            </label>
            <ChipCombobox
              id="criteria-cities"
              ariaLabel={`Cities in ${marketName}`}
              value={locations}
              onChange={setLocations}
              options={cities}
              placeholder={cities.length ? `${cities.slice(0, 3).join(", ")}…` : "Type a city"}
              emptyHint={`Anywhere in ${marketName}`}
            />
          </div>

          <div className="search-criteria-row" id="companies">
            <label htmlFor="criteria-companies">
              <strong>Any employers in particular?</strong>
              <small>Optional. Each one gets its own search for your top role.{movedCompanies ? ` ${movedCompanies} moved here from cities — save to keep.` : ""}</small>
            </label>
            <ChipCombobox
              id="criteria-companies"
              ariaLabel="Target employers"
              value={companies}
              onChange={setCompanies}
              options={KNOWN_EMPLOYERS}
              placeholder="PwC, Deloitte, Atlassian…"
              emptyHint="No preference"
            />
          </div>

          <div className="search-criteria-row" id="work-model">
            <label>
              <strong>How do you want to work?</strong>
              <small>Remote asks providers for remote-only listings.</small>
            </label>
            <div className="work-model-options" role="group" aria-label="Preferred work model" style={{ marginTop: 0 }}>
              {["On-site", "Hybrid", "Remote", "Flexible"].map((option) => (
                <button key={option} type="button" className={remote === option ? "is-selected" : ""} onClick={() => setRemote(option)}>{option}</button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {hasChanges || status !== "idle" ? (
        <div className="search-criteria-save">
          {status === "error" ? <span className="direction-save-status is-error" role="alert">Could not save — please try again</span> : status === "saved" ? <span className="direction-save-status">Saved ✓</span> : <span className="direction-save-status">Unsaved changes</span>}
          <button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save criteria"}</button>
        </div>
      ) : null}
    </section>
  );
}
