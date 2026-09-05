"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TargetLaneRecord } from "@/lib/types";
import type { SearchSourcePreference } from "@/lib/data/search";
import { JOB_MARKETS, countryName, majorCities } from "@/lib/jobs/countries";

import { DEFAULT_JOB_SOURCES } from "@/lib/config/job-sources";

export type SearchSource = SearchSourcePreference;

/*
 * The search brief, in the order the search engine applies it:
 *
 *   1. Country      — the job market. Every provider scopes to this first.
 *   2. Geography    — cities within that country; empty means anywhere in it.
 *   3. Companies    — employers to search directly, on top of the role queries.
 *   4. Work model   — remote / hybrid / on-site preference.
 *
 * The country arrives pre-filled from the résumé (phone code, address, employer
 * location) when Sartho could read one, and is confirmed here — the market
 * someone wants is not always where they are today.
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
}: {
  initialSources: SearchSource[];
  /** The saved market, or null when the person has not confirmed one yet. */
  initialCountry: string | null;
  /** The résumé-inferred market, used as the default until one is saved. */
  inferredCountry: string | null;
  initialLocations: string[];
  initialCompanies: string[];
  initialRemote: string;
  targetLanes: TargetLaneRecord[];
}) {
  const router = useRouter();
  // Sources are kept for persistence (they satisfy the activation gate) but are
  // no longer shown or toggled: real search runs through the configured jobs
  // provider, not per-source toggles.
  const [sources] = useState<SearchSource[]>(initialSources.length ? initialSources : DEFAULT_JOB_SOURCES);
  const startingCountry = initialCountry ?? inferredCountry ?? "";
  const [country, setCountry] = useState(startingCountry);
  const [locations, setLocations] = useState(initialLocations);
  const [companies, setCompanies] = useState(initialCompanies);
  const [remote, setRemote] = useState(initialRemote);
  const [locationDraft, setLocationDraft] = useState("");
  const [companyDraft, setCompanyDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // A country that came from the résumé but was never saved still needs a save
  // so the search engine reads it from the brief, not from an inference.
  const hasChanges = useMemo(() => {
    if (country !== (initialCountry ?? "")) return true;
    if (remote !== initialRemote) return true;
    if (!sameList(locations, initialLocations)) return true;
    if (!sameList(companies, initialCompanies)) return true;
    const initialSourcesList = initialSources.length ? initialSources : DEFAULT_JOB_SOURCES;
    if (sources.length !== initialSourcesList.length) return true;
    for (let i = 0; i < sources.length; i++) {
      if (sources[i].active !== initialSourcesList[i].active) return true;
    }
    return false;
  }, [country, remote, locations, companies, sources, initialCountry, initialRemote, initialLocations, initialCompanies, initialSources]);

  function addTo(list: string[], set: (next: string[]) => void, draft: string, clear: () => void) {
    const value = draft.trim();
    if (!value || list.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    set([...list, value]);
    clear();
  }
  const addLocation = () => addTo(locations, setLocations, locationDraft, () => setLocationDraft(""));
  const addCompany = () => addTo(companies, setCompanies, companyDraft, () => setCompanyDraft(""));

  async function save() {
    if (!hasChanges) return;
    setStatus("saving");
    const finalRemote = remote || "Flexible";
    const finalSources = sources.some((source) => source.active) ? sources : DEFAULT_JOB_SOURCES;
    const response = await fetch("/api/search-plan", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        country: country || null,
        sources: finalSources,
        targetLocations: locations,
        targetCompanies: companies,
        remotePreference: finalRemote,
      }),
    });
    setStatus(response.ok ? "saved" : "error");
    if (response.ok) {
      window.dispatchEvent(new Event("sartho:journey-changed"));
      router.refresh();
    }
  }

  const marketName = countryName(country);
  const suggestedCities = majorCities(country).filter(
    (city) => !locations.some((item) => item.toLowerCase() === city.toLowerCase()),
  );
  const countryHint = !country
    ? "Sartho could not read a country from your résumé — choose the market you want to work in."
    : !initialCountry && inferredCountry === country
      ? `Read from your résumé. Change it if you are targeting a different market.`
      : null;

  return (
    <div className="search-plan-workspace">
      <section className="search-direction-context" id="profiles">
        <div><span>Targeting</span><strong>{targetLanes.length ? targetLanes.map((lane) => lane.name).join(" · ") : "No target roles selected"}</strong></div>
        <Link href="/career-direction#priorities">Edit in Career Direction →</Link>
      </section>

      <section className="glass-card direction-panel" id="country">
        <div className="direction-heading"><div><span>1 · Country</span><h2>Which job market?</h2><p>Every search is scoped to one country first. Choose the market you want to work in, which may not be where you live today.</p></div></div>
        <select
          className="search-country-select"
          aria-label="Job market country"
          value={country}
          onChange={(event) => setCountry(event.target.value)}
        >
          <option value="">Choose a country…</option>
          {JOB_MARKETS.map((market) => <option key={market.code} value={market.code}>{market.name}</option>)}
        </select>
        {countryHint ? <p className="search-field-hint">{countryHint}</p> : null}
      </section>

      <section className="glass-card direction-panel" id="geography">
        <div className="direction-heading"><div><span>2 · Geography</span><h2>Which cities{marketName ? ` in ${marketName}` : ""}?</h2><p>Add the cities you would work in — the first two are searched, and if they come back thin Sartho widens to the rest of {marketName ?? "the country"} automatically. Leave this empty to search {marketName ? `all of ${marketName}` : "the whole country"} from the start.</p></div></div>
        <div className="editable-chips">
          {locations.length
            ? locations.map((location) => <button key={location} type="button" onClick={() => setLocations((items) => items.filter((item) => item !== location))}>{location}<span>×</span></button>)
            : <span className="search-field-hint" style={{ alignSelf: "center" }}>{marketName ? `Anywhere in ${marketName}` : "Anywhere in the country"}</span>}
        </div>
        <div className="inline-add"><input value={locationDraft} onChange={(event) => setLocationDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addLocation())} placeholder={suggestedCities[0] ? `${suggestedCities.slice(0, 3).join(", ")}…` : "City name"} /><button type="button" onClick={addLocation}>Add</button></div>
        {suggestedCities.length || locations.length ? (
          <div className="city-quick-add" role="group" aria-label="Quick add cities">
            {suggestedCities.length ? <span>Quick add:</span> : null}
            {suggestedCities.map((city) => (
              <button key={city} type="button" onClick={() => setLocations((items) => [...items, city])}>+ {city}</button>
            ))}
            {locations.length && marketName ? (
              <button type="button" className="is-clear" onClick={() => setLocations([])}>Anywhere in {marketName}</button>
            ) : null}
          </div>
        ) : null}
        <div className="work-model-options" role="group" aria-label="Preferred work model">{["On-site", "Hybrid", "Remote", "Flexible"].map((option) => <button key={option} type="button" className={remote === option ? "is-selected" : ""} onClick={() => setRemote(option)}>{option}</button>)}</div>
      </section>

      <section className="glass-card direction-panel" id="companies">
        <div className="direction-heading"><div><span>3 · Target companies</span><h2>Any employers you want specifically?</h2><p>Each company here gets its own search for your top role{marketName ? ` in ${marketName}` : ""}, on top of the general search. Optional.</p></div></div>
        <div className="editable-chips">{companies.map((company) => <button key={company} type="button" onClick={() => setCompanies((items) => items.filter((item) => item !== company))}>{company}<span>×</span></button>)}</div>
        <div className="inline-add"><input value={companyDraft} onChange={(event) => setCompanyDraft(event.target.value)} onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), addCompany())} placeholder="PwC, Deloitte, Atlassian…" /><button type="button" onClick={addCompany}>Add</button></div>
      </section>

      {hasChanges || status !== "idle" ? (
        <div className="direction-save-bar">
          {status === "error" ? <span className="direction-save-status is-error" role="alert">Could not save — please try again</span> : status === "saved" ? <span className="direction-save-status">Saved ✓</span> : null}
          <button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save changes"}</button>
        </div>
      ) : null}
    </div>
  );
}
