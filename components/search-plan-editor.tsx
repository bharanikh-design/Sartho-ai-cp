"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TargetLaneRecord } from "@/lib/types";
import type { SearchSourcePreference } from "@/lib/data/search";
import { JOB_MARKETS, cityOptions, countryName } from "@/lib/jobs/countries";
import { EMPLOYMENT_TYPES } from "@/lib/jobs/employment-types";
import { KNOWN_EMPLOYERS } from "@/lib/jobs/employers";
import { ChipCombobox } from "@/components/chip-combobox";

import { DEFAULT_JOB_SOURCES } from "@/lib/config/job-sources";

export type SearchSource = SearchSourcePreference;

/*
 * The search criteria as follow-up questions in one card, in the order the
 * engine applies them: countries → cities → employers → type of work → work
 * model. Each question appears once the one before it is answered. The page's
 * real content — the matching roles — sits directly below, so this stays short.
 */

const MARKET_NAMES = JOB_MARKETS.map((market) => market.name);
const CODE_BY_NAME = new Map(JOB_MARKETS.map((market) => [market.name.toLowerCase(), market.code]));

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function SearchPlanEditor({
  initialSources,
  initialCountries,
  inferredCountry,
  initialEmploymentTypes,
  initialLocations,
  initialCompanies,
  initialRemote,
  targetLanes,
  movedCompanies = 0,
}: {
  initialSources: SearchSource[];
  /** Saved markets, primary first. */
  initialCountries: string[];
  /** The résumé-inferred market, offered when nothing is saved. */
  inferredCountry: string | null;
  initialEmploymentTypes: string[];
  initialLocations: string[];
  initialCompanies: string[];
  initialRemote: string;
  targetLanes: TargetLaneRecord[];
  /** Employers found in the saved cities list and moved across on load. */
  movedCompanies?: number;
}) {
  const router = useRouter();
  const [sources] = useState<SearchSource[]>(initialSources.length ? initialSources : DEFAULT_JOB_SOURCES);

  const startingCountries = initialCountries.length
    ? initialCountries
    : inferredCountry ? [inferredCountry] : [];
  // The combobox works in names; codes are what gets saved.
  const [countryNames, setCountryNames] = useState<string[]>(
    startingCountries.map((code) => countryName(code)).filter((name): name is string => Boolean(name)),
  );
  const [employmentTypes, setEmploymentTypes] = useState(initialEmploymentTypes);
  const [locations, setLocations] = useState(initialLocations);
  const [companies, setCompanies] = useState(initialCompanies);
  const [remote, setRemote] = useState(initialRemote);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const codes = useMemo(
    () => countryNames.map((name) => CODE_BY_NAME.get(name.toLowerCase())).filter((code): code is string => Boolean(code)),
    [countryNames],
  );
  const primary = codes[0] ?? null;
  const primaryName = primary ? countryName(primary) : null;

  /*
   * A country read from the résumé but never saved still counts as a change, as
   * do employers moved out of the cities list: both need a save to take effect.
   */
  const hasChanges = useMemo(() => {
    if (!sameList(codes, initialCountries)) return true;
    if (movedCompanies > 0) return true;
    if (remote !== initialRemote) return true;
    if (!sameList(employmentTypes, initialEmploymentTypes)) return true;
    if (!sameList(locations, initialLocations)) return true;
    if (!sameList(companies, initialCompanies)) return true;
    return false;
  }, [codes, movedCompanies, remote, employmentTypes, locations, companies, initialCountries, initialRemote, initialEmploymentTypes, initialLocations, initialCompanies]);

  async function save() {
    if (!hasChanges) return;
    setStatus("saving");
    const response = await fetch("/api/search-plan", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        country: primary,
        countries: codes,
        employmentTypes,
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

  // Cities come from every chosen market, so someone searching two countries
  // can name a city in either.
  const cities = useMemo(() => [...new Set(codes.flatMap((code) => cityOptions(code)))], [codes]);

  function toggleEmployment(id: string) {
    setEmploymentTypes((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  return (
    <section className="glass-card search-criteria" id="criteria" aria-label="Search criteria">
      <div className="search-criteria-roles">
        <span>Searching for</span>
        <strong>{targetLanes.length ? targetLanes.map((lane) => lane.name).join(" · ") : "No target roles yet"}</strong>
        <Link href="/career-direction#priorities">Edit roles →</Link>
      </div>

      <div className="search-criteria-row" id="country">
        <label htmlFor="criteria-countries">
          <strong>Where do you want to work?</strong>
          <small>
            {!codes.length
              ? "Choose one or more markets. They may not be where you live today."
              : codes.length > 1
                ? `${primaryName} is searched in full; the others are searched for your top role.`
                : "Add another if you hold work rights in more than one country."}
          </small>
        </label>
        <ChipCombobox
          id="criteria-countries"
          ariaLabel="Countries to search"
          value={countryNames}
          onChange={(next) => { setCountryNames(next); setLocations([]); }}
          options={MARKET_NAMES}
          placeholder="Australia, Singapore, India…"
          emptyHint="No country chosen"
          max={8}
        />
      </div>

      {codes.length ? (
        <>
          <div className="search-criteria-row" id="geography">
            <label htmlFor="criteria-cities">
              <strong>Which cities?</strong>
              <small>Start typing to pick. Leave empty for anywhere in {primaryName}; a thin city widens to the rest automatically.</small>
            </label>
            <ChipCombobox
              id="criteria-cities"
              ariaLabel="Cities to search"
              value={locations}
              onChange={setLocations}
              options={cities}
              placeholder={cities.length ? `${cities.slice(0, 3).join(", ")}…` : "Type a city"}
              emptyHint={`Anywhere in ${primaryName}`}
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

          <div className="search-criteria-row" id="employment-type">
            <label>
              <strong>What type of work?</strong>
              <small>Sent to the job boards as a filter. Choose none for any type.</small>
            </label>
            <div className="employment-type-options" role="group" aria-label="Type of work">
              {EMPLOYMENT_TYPES.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  aria-pressed={employmentTypes.includes(type.id)}
                  className={employmentTypes.includes(type.id) ? "is-selected" : ""}
                  onClick={() => toggleEmployment(type.id)}
                >
                  {type.id}
                </button>
              ))}
            </div>
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
