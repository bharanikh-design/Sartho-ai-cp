# Sartho product architecture

## Product promise

Sartho is an evidence-led career decision service. It must help a person:

1. establish a trustworthy career foundation;
2. define an intentional search strategy;
3. assess worthwhile opportunities;
4. prepare an honest application;
5. track outcomes and improve future decisions.

The product is not organised around technical modules. It is organised around
four user-owned domains:

- **Career Profile:** source résumés, approved evidence, career history,
  strengths and direction;
- **Search Strategy:** target profiles, priority weights, locations, work model
  and trusted sources;
- **Opportunities:** discovered or manually added roles, source provenance,
  screening, evidence mapping and decisions;
- **Applications:** tailored materials, submission state, interviews, outcomes
  and next actions.

## Lifecycle

The Dashboard is available from the first authenticated visit. Before activation,
it presents Your Journey as a progressive setup workflow using one canonical
completion model shared by the Dashboard, Journey and shell:

1. master résumé;
2. AI extraction;
3. evidence confirmation;
4. career context;
5. career strengths;
6. target profiles;
7. search strategy.

After activation, the recurring navigation is Home, Opportunities,
Applications, Career Profile and Search Strategy. Résumé tailoring and interview
preparation are contextual actions inside an opportunity or application rather
than permanent top-level destinations.

## Trust and security boundaries

- Authentication is verified server-side for every protected API operation.
- Row Level Security remains the final ownership boundary in PostgreSQL.
- AI receives approved evidence only for analysis and résumé drafting.
- AI work is rate-limited with a server-only usage ledger.
- Source URLs and all user-controlled API input are bounded and validated.
- Database errors are logged server-side and replaced with non-sensitive user
  messages.
- No external application, email or profile claim is submitted without explicit
  user approval.

## Reliability rules

- Journey progress is derived from durable records, never a browser-only flag.
- A replacement write must be stored before the last known-good data is removed.
- Removed search priorities are disabled before best-effort cleanup.
- Provider failure is classified into actionable user states without leaking
  credentials, billing details or raw provider output.
- The Dashboard remains accessible throughout setup; personalized opportunity
  matching activates only after the complete search foundation exists.

## Scalability direction

Opportunity ingestion will use an adapter boundary so official employer feeds,
supported marketplaces, user-added links and a future browser extension can
produce one normalised opportunity record. Connectors must preserve source URL,
retrieval time, jurisdiction, freshness and compliance status.

Discovery, ranking and deep analysis are separate workloads:

1. ingestion normalises source data;
2. deterministic filters enforce location, exclusions and obvious constraints;
3. ranking uses target-profile weights and approved evidence signals;
4. expensive AI analysis runs only when the user opens or explicitly requests
   a deeper decision.

This separation prevents source volume from multiplying AI cost and allows each
workload to scale independently.

## Product measures

- time from sign-in to activated search;
- time from activation to first credible opportunity;
- recommendation save/dismiss rate;
- evidence correction rate;
- application and interview conversion;
- opportunity freshness and source coverage;
- AI cost per activated user and per pursued opportunity.
