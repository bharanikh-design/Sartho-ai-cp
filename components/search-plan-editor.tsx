"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { TargetLaneRecord } from "@/lib/types";
import type { SearchSourcePreference } from "@/lib/data/search";
import { JOB_MARKETS, cityOptions, countryName, regionLabel, regionOptions } from "@/lib/jobs/countries";
import { EMPLOYMENT_TYPES, earlyCareerSelections } from "@/lib/jobs/employment-types";
import { EXPERIENCE_BANDS, bandForYears, experienceBand, type ExperienceBandId } from "@/lib/jobs/experience";
import { KNOWN_EMPLOYERS } from "@/lib/jobs/employers";
import { ChipCombobox } from "@/components/chip-combobox";
import { MAX_LOCATION_QUERIES } from "@/lib/jobs/search-plan";

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
  initialExperience,
  resumeYears,
  initialEmploymentTypes,
  initialLocations,
  initialCompanies,
  initialRemotePreferences,
  targetLanes,
  movedCompanies = 0,
}: {
  initialSources: SearchSource[];
  /** Saved markets, primary first. */
  initialCountries: string[];
  /** The résumé-inferred market, offered when nothing is saved. */
  inferredCountry: string | null;
  /** The band this person chose, or null if they never have. */
  initialExperience: ExperienceBandId | null;
  /** The total read off their résumé, offered when they have not answered. */
  resumeYears: number | null;
  initialEmploymentTypes: string[];
  initialLocations: string[];
  initialCompanies: string[];
  initialRemotePreferences: string[];
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
  /*
   * The résumé's total is a suggestion, not the answer.
   *
   * It is pre-selected because a filled-in form beats an empty one, and it is
   * labelled with where it came from because it is frequently wrong — this
   * number decides which roles are hidden, and somebody whose document parsed
   * badly had no way to say so. It stays a suggestion until saved: the person
   * confirming a pre-filled band is the point at which Sartho stops guessing.
   */
  const suggestedExperience = bandForYears(resumeYears);
  const [experience, setExperience] = useState<ExperienceBandId | null>(initialExperience ?? suggestedExperience);
  const [employmentTypes, setEmploymentTypes] = useState(initialEmploymentTypes);
  const [locations, setLocations] = useState(initialLocations);
  const [companies, setCompanies] = useState(initialCompanies);
  const [remotePreferences, setRemotePreferences] = useState(initialRemotePreferences);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  /*
   * Out of the way once it is answered.
   *
   * This is a form you fill in rarely and read constantly — the roles, the
   * markets, the cities are worth a glance before you look at the matches, but
   * six labelled questions is most of a screen, and the matches are what the
   * page is for. So it collapses to a single line the moment it has been
   * saved, and on every later visit opens collapsed.
   *
   * Only ever when there is nothing outstanding: an unsaved change collapsed
   * out of sight is a change nobody knows they still have.
   */
  const [expanded, setExpanded] = useState(!initialCountries.length || movedCompanies > 0);

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
    if (!sameList(remotePreferences, initialRemotePreferences)) return true;
    /* A band suggested from the résumé but never saved is a change too. */
    if (experience !== initialExperience) return true;
    if (!sameList(employmentTypes, initialEmploymentTypes)) return true;
    if (!sameList(locations, initialLocations)) return true;
    if (!sameList(companies, initialCompanies)) return true;
    return false;
  }, [codes, movedCompanies, remotePreferences, experience, employmentTypes, locations, companies, initialCountries, initialRemotePreferences, initialExperience, initialEmploymentTypes, initialLocations, initialCompanies]);

  async function save() {
    if (!hasChanges) return;
    setStatus("saving");
    const response = await fetch("/api/search-plan", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        country: primary,
        countries: codes,
        experienceLevel: experience,
        employmentTypes,
        sources: sources.some((source) => source.active) ? sources : DEFAULT_JOB_SOURCES,
        targetLocations: locations,
        targetCompanies: companies,
        remotePreferences,
      }),
    });
    setStatus(response.ok ? "saved" : "error");
    if (response.ok) {
      window.dispatchEvent(new Event("sartho:journey-changed"));
      /* Saved and answered, so it gets out of the way of the matches. */
      setExpanded(false);
      router.refresh();
    }
  }

  // Cities come from every chosen market, so someone searching two countries
  // can name a city in either.
  const cities = useMemo(() => [...new Set(codes.flatMap((code) => cityOptions(code)))], [codes]);

  /*
   * Where you will work, as one question rather than two fields.
   *
   * The honest answer is sometimes a city and sometimes a state — "Sydney", or
   * "anywhere in New South Wales" — and which of those somebody means is not a
   * taxonomy decision they should have to make before they can type. So both
   * live in one chip list, under headings, and a region is just a broader chip.
   *
   * Regions come from every chosen market, and only the markets that have them:
   * Singapore has no states, and New Zealand's regions are named after its
   * cities.
   */
  const regionGroups = useMemo(() => {
    const byLabel = new Map<string, string[]>();
    for (const code of codes) {
      const label = regionLabel(code);
      if (!label) continue;
      byLabel.set(label, [...(byLabel.get(label) ?? []), ...regionOptions(code)]);
    }
    return [...byLabel].map(([label, regions]) => ({ label, options: [...new Set(regions)] }));
  }, [codes]);

  const placeGroups = useMemo(
    () => (regionGroups.length ? [{ label: "Cities", options: cities }, ...regionGroups] : []),
    [cities, regionGroups],
  );

  /*
   * A reload must not be how you find out the change was never saved.
   *
   * The save bar sits at the foot of a long form. Add an employer at the top
   * and the button is off screen, so it is entirely possible — and it happened
   * — to add four, navigate away, and come back to five. Nothing said anything.
   * The bar is sticky now so it cannot be out of view while there is something
   * to save, and this is the backstop for leaving the page entirely.
   */
  useEffect(() => {
    if (!hasChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasChanges]);

  /* The selections that are a hint rather than a filter, named as such. */
  const earlyCareerChosen = useMemo(() => earlyCareerSelections(employmentTypes), [employmentTypes]);

  function toggleEmployment(id: string) {
    setEmploymentTypes((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  /*
   * The whole brief in one line, in the order the engine applies it. This is
   * what the collapsed card shows, and it has to be enough to trust without
   * opening anything — if you cannot tell at a glance that it is still
   * searching Sydney and not Melbourne, the collapse has cost more than the
   * space it saved.
   */
  const summary = [
    countryNames.join(" · "),
    locations.length ? locations.join(" · ") : primaryName ? `Anywhere in ${primaryName}` : "",
    experience ? experienceBand(experience)?.label ?? "" : "",
    companies.length ? `${companies.length} employer${companies.length === 1 ? "" : "s"}` : "",
    employmentTypes.join(" · "),
    remotePreferences.join(" · "),
  ].filter(Boolean);

  return (
    <section className={`glass-card search-criteria${expanded ? "" : " is-collapsed"}`} id="criteria" aria-label="Search criteria">
      <div className="search-criteria-roles">
        <span>Searching for</span>
        <strong>{targetLanes.length ? targetLanes.map((lane) => lane.name).join(" · ") : "No target roles yet"}</strong>
        <Link href="/career-direction#priorities">Edit roles →</Link>
      </div>

      {!expanded ? (
        <div className="search-criteria-summary">
          <p>{summary.join("  ·  ")}</p>
          <button type="button" className="secondary-button" onClick={() => setExpanded(true)}>
            Edit criteria
          </button>
        </div>
      ) : null}

      {expanded ? (
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
      ) : null}

      {expanded && codes.length ? (
        <>
          <div className="search-criteria-row" id="geography">
            <label htmlFor="criteria-cities">
              <strong>{regionGroups.length ? <>Where in {primaryName}?</> : "Which cities?"}</strong>
              <small>
                {regionGroups.length
                  ? <>A city, or a whole state — pick either. Leave empty for anywhere in {primaryName}; a thin city widens to the rest automatically.</>
                  : <>Start typing to pick. Leave empty for anywhere in {primaryName}; a thin city widens to the rest automatically.</>}
                {/*
                  * Said here rather than discovered afterwards. The engine
                  * queries at most two locations, and a list of six looked as
                  * though all six were being searched — the results panel
                  * reported what actually ran, but only once it was too late to
                  * choose differently.
                  */}
                {locations.length > MAX_LOCATION_QUERIES ? (
                  <>
                    {" "}Only the first {MAX_LOCATION_QUERIES} are searched — <strong>{locations.slice(0, MAX_LOCATION_QUERIES).join(" and ")}</strong>.
                    {regionGroups.length ? " A state covers more ground than a second city." : ""}
                  </>
                ) : null}
              </small>
            </label>
            <ChipCombobox
              id="criteria-cities"
              ariaLabel={regionGroups.length ? "Cities and states to search" : "Cities to search"}
              value={locations}
              onChange={setLocations}
              options={cities}
              groups={placeGroups}
              placeholder={
                regionGroups.length
                  ? `${cities[0] ?? "City"}, ${regionGroups[0]?.options[0] ?? "State"}…`
                  : cities.length ? `${cities.slice(0, 3).join(", ")}…` : "Type a city"
              }
              emptyHint={`Anywhere in ${primaryName}`}
            />
          </div>

          {/*
            * Asked here, not on the profile, because this is where its effect
            * is visible. It is the only question on this card about the person
            * rather than the search, and it earns its place by doing two things
            * nothing else can: it decides which titles are out of reach, and it
            * removes adverts that demand more years than the person has.
            *
            * The bands say what each one does rather than only what it is. "0–1
            * years" alone is a fact about you; "graduate postings get their own
            * search pass" is the reason to answer honestly instead of rounding
            * yourself up.
            */}
          <div className="search-criteria-row" id="experience">
            <label>
              <strong>How much experience do you have?</strong>
              <small>
                {experience
                  ? experienceBand(experience)?.note
                  : "Roles asking for far more years than this are left out of your results."}
                {/*
                  * Where a pre-filled answer came from. A number read off a
                  * document and used silently is the same failure as a country
                  * guessed silently — it decides what you are shown, so it is
                  * said out loud and can be corrected in one click.
                  */}
                {!initialExperience && suggestedExperience ? (
                  <> Read as <strong>{resumeYears} year{resumeYears === 1 ? "" : "s"}</strong> from your résumé — change it if that is wrong, then save.</>
                ) : null}
              </small>
            </label>
            <div className="work-model-options" role="group" aria-label="Years of experience" style={{ marginTop: 0 }}>
              {EXPERIENCE_BANDS.map((band) => (
                <button
                  key={band.id}
                  type="button"
                  aria-pressed={experience === band.id}
                  className={experience === band.id ? "is-selected" : ""}
                  onClick={() => setExperience(experience === band.id ? null : band.id)}
                >
                  {band.label}
                </button>
              ))}
            </div>
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
              {/*
                * Which of these is a filter and which is a wish.
                *
                * This said "sent to the job boards as a filter" about all six,
                * and that is only true of four. Adzuna — the provider actually
                * running — has boolean parameters for full time, part time,
                * contract and permanent, and nothing at all for internship or
                * graduate programme. Those two are words folded into the query
                * text, which is a weaker thing, and they get their own pass
                * because the full-time flag selected alongside them would
                * otherwise exclude exactly what they are asking for.
                *
                * The engine has always handled that correctly. The label just
                * claimed more than it does, which is the kind of small
                * overstatement that makes somebody stop believing the rest.
                */}
              <small>
                Full-time, Part-time, Contract and Permanent are sent as a real filter. Choose none for any type.
                {earlyCareerChosen.length ? (
                  <>
                    {" "}<strong>{earlyCareerChosen.join(" and ")}</strong>{" "}
                    {earlyCareerChosen.length === 1 ? "has" : "have"} no filter on the job boards, so Sartho searches for the words in
                    {earlyCareerChosen.length === 1 ? " its" : " their"} own extra pass instead — weaker, but not silently dropped.
                  </>
                ) : null}
              </small>
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
                <button 
                  key={option} 
                  type="button" 
                  className={remotePreferences.includes(option) ? "is-selected" : ""} 
                  onClick={() => setRemotePreferences((prev: string[]) => 
                    prev.includes(option) ? prev.filter((p: string) => p !== option) : [...prev, option]
                  )}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      {/*
        * Nothing to save means nothing to press but Hide, and expanding is not
        * a one-way door: somebody who opened this to check a city needs a way
        * back to their matches without pretending to edit something.
        *
        * Never offered before the first save, because a brief that has never
        * been answered has nothing worth collapsing into a summary.
        */}
      {expanded ? (
        <div className={`search-criteria-save${hasChanges ? " is-dirty" : ""}`}>
          {status === "error"
            ? <span className="direction-save-status is-error" role="alert">Could not save — please try again</span>
            : hasChanges
              ? <span className="direction-save-status">Unsaved changes</span>
              : null}
          {hasChanges
            ? <button type="button" className="primary-button" onClick={() => void save()} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save criteria"}</button>
            : initialCountries.length
              ? <button type="button" className="secondary-button" onClick={() => setExpanded(false)}>Hide criteria</button>
              : null}
        </div>
      ) : null}
    </section>
  );
}
