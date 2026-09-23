# Sartho Product Delivery Roadmap

> Living delivery ledger. Update this document when a capability crosses `main`, changes scope, or a new commitment is accepted.
>
> **North star:** A user should be able to bring Sartho a résumé and, in roughly 10–15 minutes, understand their credible career options, find worthwhile roles, understand why they fit, and prepare a truthful ATS-ready application without wondering what to do next.

Last reviewed: 23 September 2026

## Delivery principles

1. **One coherent journey, not a collection of pages.** Every completed action answers “What happened?” and “What should I do next?”
2. **Evidence before AI confidence.** AI may explore; Career Evidence and real market evidence must earn recommendations.
3. **Never invent.** No unsupported résumé claims, applicant counts, contacts, job requirements or career possibilities.
4. **Original documents are user-owned truth.** Uploads must not be silently truncated, rewritten or discarded.
5. **A saved job is safe before analysis starts.** Background intelligence must never make a successful capture look like a failure.
6. **Prefer reliable doors over brittle scraping.** Verified employer ATS sources and explicit browser capture beat speculative crawling.
7. **Surgical delivery.** One coherent objective per PR. No broad source rewrites for small UX changes.
8. **Merge gate:** Typecheck → Lint → Tests → Production Build → Review → Vercel → Main.

## Recently delivered to main

| Capability | PR | State |
|---|---:|---|
| Job Search 2.0 / direct-employer handling | #168 | ✅ Main |
| ATS Intelligence 2.0 — weighted Mandatory / Important / Preferred requirements | #169 | ✅ Main |
| Home Career Pulse redesign | #170 | ✅ Main |
| Opportunity Gateway foundation — Workday / Greenhouse / Lever discovery | #171 | ✅ Main |
| Résumé Studio inline Collapse to list | #172 | ✅ Main |
| Fluid Career Launch — upload completion handoff + replayable Tour entry | #175 | ✅ Main |
| Hide non-actionable résumé import/provider failure history | #174 | ✅ Main |

## Active PR queue

### #173 — Opportunity Gateway UX
**Goal:** make employer careers-source discovery usable from Search Criteria.

- [x] Employer + Careers URL input
- [x] Detect Workday / Greenhouse / Lever
- [x] Test the actual public ATS endpoint
- [x] Report Healthy / Degraded / Unsupported
- [x] Show sampled jobs/provider
- [x] Add verified employer to target-employer list
- [ ] Full CI / Review / Vercel green on final head
- [ ] Merge to main

### #176 — Cinematic Product Tour V2
**Goal:** make the tour fast, useful, escapable and memorable.

- [x] Fix Close / Skip / Escape / Enter Sartho trap
- [x] Remove replay query on exit
- [x] Reduce six reading-heavy slides to four acts
- [x] Add purposeful motion and product-state visuals
- [x] Respect reduced-motion preference
- [ ] Validate final gates
- [ ] Include Browser Extension journey prominently
- [ ] Merge to main

## Planned work — ordered

### 1. Résumé Studio information flow
**Outcome:** the page behaves like a workspace, not a collection of implementation cards.

Target flow:

`Add résumé / Build résumé → Your Résumés → Edit`

- [ ] Slim Add résumé action
- [ ] Adjacent Build résumé action
- [ ] Move source uploads/provenance behind a compact disclosure
- [ ] Keep My Résumés as the primary working area
- [ ] Role picker appears only when Build résumé is requested
- [ ] Successful build opens the new résumé automatically
- [ ] Preserve existing Master and dedupe behavior

### 2. Original résumé fidelity
**Outcome:** bringing a résumé into Sartho must not destroy the document the user already perfected.

Current gap: Studio currently reconstructs an uploaded résumé from extracted text/AI structure. That can preserve words but cannot guarantee Word formatting fidelity.

Required architecture:

`Original DOCX → preserved source artifact → faithful working copy → optional Sartho transformation`

- [ ] Treat original DOCX as immutable source artifact
- [ ] Preserve all content — including 3–4+ page documents
- [ ] Preserve styles, fonts, spacing, tables, columns, headers/footers and section/page structure where technically possible
- [ ] Never silently truncate
- [ ] Separate **Original Mode** from Sartho-template mode
- [ ] Export a faithful copy when no redesign was requested
- [ ] Add content-fidelity regression tests
- [ ] Add document-structure/layout fidelity tests
- [ ] Surface fidelity warnings rather than pretending reconstruction is identical
- [ ] Treat PDF separately: PDF is a fixed-layout source, not an editable DOCX

**Release bar:** zero missing content and materially identical layout for supported DOCX fixtures.

### 3. Career Launch / Journey 2.0
**Outcome:** first useful result in roughly 10–15 minutes.

Journey:

1. Upload résumé
2. Confirm career direction
3. Set search brief
4. Find a real opportunity
5. Analyse fit
6. Prepare first tailored résumé

- [x] Upload success “Got it” moment
- [ ] Persistent compact setup progress during onboarding
- [ ] Every step has one authoritative Next Best Action
- [ ] Never block progress while background AI runs
- [ ] Return user to journey context after each major completion
- [ ] Show approximate remaining effort without fake precision
- [ ] Completion moment transitions from setup journey to recurring Career Pulse

### 4. Browser Extension / Extension Handoff 2.0
**Outcome:** find jobs anywhere; keep and decide on them in one place.

Canonical flow:

`LinkedIn / SEEK / Indeed / employer careers / other supported page → Sartho extension → Opportunities → background analysis → opportunity decision`

- [x] Extension sends captures to Opportunities
- [x] Captured role is persisted before deep analysis
- [ ] Immediately show **Saved to Opportunities ✓**
- [ ] Deep analysis becomes clearly non-blocking/background
- [ ] Stop indefinite spinner; show delayed/held state after a bounded wait
- [ ] Canonicalize title: remove employer/source/browser-title furniture
- [ ] Preserve employer and source as separate fields
- [ ] Capture original job URL
- [ ] Capture direct Apply URL when explicitly exposed
- [ ] Prefer verified employer Apply destination when available
- [ ] Capture applicant signal exactly as displayed, when available
- [ ] Capture hiring manager / recruiter / job poster when explicitly displayed
- [ ] Capture public contact information only when actually shown in the advert/page
- [ ] Capture posting age, employment type and workplace model where reliable
- [ ] Timestamp ephemeral signals such as applicant counts
- [ ] Do not infer missing contact/applicant data
- [ ] Add “Apply on employer site” and “Open original listing” actions where supported
- [ ] Promote extension in Product Tour and Opportunities
- [ ] Show installed/connected state instead of repeatedly advertising installation

### 5. Opportunity Gateway completion
**Outcome:** broad job discovery without dependence on brittle scraping.

Source hierarchy:

1. Verified direct employer ATS
2. Employer careers page
3. Google Jobs / SerpAPI discovery
4. Other licensed/verified feeds
5. User-triggered Browser Extension capture

- [ ] Persist verified employer source configuration
- [ ] Employer Registry
- [ ] Source health: Healthy / Degraded / Broken / Unknown
- [ ] Last successful fetch
- [ ] Live vacancy count/coverage where reliable
- [ ] User-supplied Careers URL contributes to registry safely
- [ ] Canonicalize duplicate vacancies; direct employer wins
- [ ] Investigate additional ATS connectors only after real-source validation
- [ ] University/specialist job-board source discovery using the same test-before-trust model

### 6. SerpAPI / Google Jobs production proof
**Outcome:** prove useful Google Jobs actually reach a Sartho user.

- [ ] Confirm production key/configuration
- [ ] Execute live Google Jobs query
- [ ] Validate pagination
- [ ] Validate description depth/quality
- [ ] Normalize fields
- [ ] Deduplicate against direct employer sources
- [ ] Identify/direct users to first-party Apply destination when available
- [ ] Confirm results render in Find Roles
- [ ] Measure useful unique vacancies contributed per search
- [ ] Keep free tier until usage evidence justifies subscription
- [ ] Add source-health/diagnostic visibility

Success is **not** “the API returned JSON.” Success is “the user sees useful, trustworthy jobs in Sartho.”

### 7. Analyse Role 2.0 UX
**Outcome:** expose the intelligence already built in ATS/requirement matching.

- [ ] Mandatory / Important / Preferred requirement groups
- [ ] Evidenced vs missing requirements
- [ ] Evidence strength and cited Career Evidence
- [ ] “Why Sartho says this”
- [ ] Clear title/seniority fit
- [ ] Separate facts, evidence and uncertainty
- [ ] Avoid gimmicky precision/percentages that cannot be defended
- [ ] Make gaps actionable without inventing experience

### 8. Career Possibility Engine
**Outcome:** do not trap a user inside their previous job title; reveal credible futures without career fantasy.

Principle:

> AI may propose the possibility. Evidence must earn it. The market must validate it.

Candidate horizons:

- Natural progression
- Adjacent move
- Emerging/AI-era industry opportunity
- Credible stretch/pivot

Evidence gate for every surfaced possibility:

- [ ] Career Evidence overlap — “Why you?”
- [ ] Transferable capability bridge
- [ ] Seniority plausibility
- [ ] Gap severity — “What is missing?”
- [ ] Live market validation — “Does this opportunity actually exist?”
- [ ] Geography/work-authorisation constraints where provided
- [ ] Actual searchable employer titles
- [ ] Actual jobs supporting the market signal

Do not show speculative hypotheses that fail the gate.

Preferred language is descriptive and auditable:
- Evidence strength
- Market signal
- Bridge distance
- Key gaps

Avoid unexplained “87% suitable” style numbers.

Test personas:
- [ ] Mechanical Engineer
- [ ] Management Consultant
- [ ] Software Engineer
- [ ] Finance professional
- [ ] Graduate
- [ ] Career changer

Quality dimensions:
- relevance
- grounding
- useful novelty
- seniority calibration
- searchability
- real opportunity yield

### 9. AI usage / Career Intelligence review
**Outcome:** ensure AI adds reasoning rather than decorative generation.

Audit chain:

`Master résumé → extraction → Career Evidence → Skill Profile → AI possibilities → evidence ranking → target lanes → search titles → retrieved jobs → Job Match`

Questions to answer:
- [ ] Are suggestions grounded in evidence?
- [ ] Do they discover non-obvious but plausible paths?
- [ ] Are career-level jumps bounded?
- [ ] Are generated role titles actually used by employers?
- [ ] Does a suggested direction produce appropriate live jobs?
- [ ] Can the user see why the suggestion exists?
- [ ] Can curiosity be explored without permanently changing Career Direction?
- [ ] Does user behavior later help refine active directions without taking control away from the user?

### 10. Interview Buddy — parked / Coming Soon
**Not current delivery scope.**

Left-navigation placeholder only.

Future concept:
- exact role + Career Profile + résumé
- likely behavioral/domain/technical questions
- strongest evidence/story for each question
- STAR-style practice where useful
- gap/weak-area preparation
- company/role research
- high-quality external resources and videos
- practice conversation and evidence-grounded coaching

No fake launch date.

## Product outcomes

All planned work must strengthen one of these four current outcomes:

### A. Frictionless journey
Onboarding, Home, Product Tour, transitions, handoffs.

### B. Great résumé
Original fidelity, Résumé Studio, ATS readiness, market-aware presentation.

### C. Find the right job
Search, Opportunity Gateway, Browser Extension, SerpAPI, employer sources.

### D. Career intelligence
Evidence, realistic possibilities, role analysis, market validation.

Interview preparation becomes a fifth outcome later, after the core loop is excellent.

## Definition of done

A feature is not done because code exists.

It is done when:
- the intended user flow works end-to-end;
- failure states are honest and recoverable;
- no unrelated behavior regresses;
- Typecheck, Lint, Tests and Production Build pass;
- Review passes;
- Vercel deployment is Ready;
- the PR is merged to `main`;
- this roadmap is updated.
