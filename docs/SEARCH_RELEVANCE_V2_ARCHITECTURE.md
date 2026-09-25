# Search Relevance V2 — Architecture Contract

## Objective

Sartho must answer:

> Is this opportunity realistically worth this person's time?

It must not answer that question by title string similarity alone.

The search pipeline therefore separates **retrieval**, **integrity constraints**, **semantic understanding**, and **ranking**.

---

## Pipeline

Candidate Context
→ Retrieval Context
→ Job providers / employer portals
→ Integrity gates
→ Deterministic evidence score
→ Bounded Semantic Job Context
→ Relevance tier
→ User-facing shortlist

### 1. Candidate Context

Authoritative inputs:
- Career Truth
- explicit Career Direction
- Search Brief
- lower-authority Learned Affinity

No search-local candidate model is allowed.

### 2. Retrieval Context

Explicit target roles are always queried.

A bounded semantic expansion may add up to five market titles based on:
- held titles;
- approved/evidenced capabilities;
- explicit target roles;
- weak learned affinity.

Generated titles can widen retrieval only.
They may never replace explicit target roles.

Equivalent and credible adjacent titles are allowed.
A new profession or specialist domain is not.

### 3. Integrity gates

Only constraints with enough confidence to be treated as factual are allowed to reject before semantic job understanding:

- explicit market/location mismatch;
- truly unreachable seniority;
- explicit stated experience requirement beyond the candidate's selected range;
- explicit user/provider constraints.

The following are **not** hard gates:

- job family vocabulary;
- literal title overlap;
- generic title similarity.

Those are diagnostic/ranking signals only.

### 4. Deterministic evidence score

The Career Conductor remains the single numeric score authority.

It produces:
- title fit;
- requirement coverage;
- evidence depth;
- priority lift;
- canonical recommendation/percentage.

Semantic Search V2 does not invent another percentage.

### 5. Semantic shortlist

Semantic Job Context is bounded to twelve jobs per pass.

Most slots go to high canonical candidates.

A reserved rescue lane intentionally includes roles the old family/title vocabulary disliked when their requirement coverage is still meaningful.

This allows titles such as:
- Service Assurance;
- Service Delivery;
- CSI / Continual Service Improvement;
- IT Governance & Controls;
- ITSM Operations

to be understood before being rejected.

It does not hard-code those phrases into matching rules.

### 6. Semantic relation

Each assessed job is classified as:

- aligned
- adjacent
- conflict
- unclear

A high-confidence conflict may exclude the job.

An aligned or adjacent assessment may rescue a role that title/family vocabulary would previously have removed.

If semantic evaluation is unavailable, weak title/family candidates fall back to the previous conservative behavior and are not rescued.

### 7. User-facing relevance

The visible classification is:

- Strong match
- Possible match
- Outside your search

The canonical evidence percentage remains secondary and unchanged.

Strong and Possible are visible.

Outside is hidden by default but may remain inspectable.

### 8. Ordering

Relevance tier decides ordering first.

Canonical numeric match orders jobs only within a tier.

A 95% deterministic score on a high-confidence semantic conflict must not outrank a 60% semantically aligned job.

---

## Query budget

Provider execution remains bounded.

Priority order:

1. every explicit target role;
2. bounded semantic market-title expansion;
3. aggregator company/title combinations;
4. early-career passes where applicable.

Named employer direct-career searches run independently and use the same retrieval vocabulary.

Generated expansion cannot consume the slots needed for explicit target roles.

---

## Failure behavior

If semantic generation fails:

- explicit target searches still run;
- deterministic scoring still works;
- weak family/title candidates are conservatively excluded;
- no job is promoted solely because the AI layer failed.

If a provider fails:

- the existing provider cascade/fallback rules remain authoritative.

---

## Golden Search regressions

The regression set must include at least:

### Credible ITSM/service-management neighborhood

- Vice President, ITSM Lead for Service Management Operations
- Associate Director, Service Assurance
- Asset & CSI Management Analyst
- IT Governance & Controls, Associate
- Senior Service Delivery Manager

These must be allowed to reach semantic evaluation even when literal title overlap is weak.

### Specialist conflict

- SAP FICO Project Manager & Solution Architect

For a ServiceNow/ITSM candidate, high-confidence SAP FICO/S4HANA specialist conflict must remain Outside.

### Failure fallback

When semantic assessment is unavailable, a weak family/title job must not be rescued automatically.

---

## Forbidden regressions

Do not reintroduce:

- `titleFit < X => drop`
- `familyFit === false => drop` before semantic understanding
- generated titles replacing explicit user target roles
- a second semantic match percentage
- a UI that hides semantic rescues because deterministic recommendation is `skip`
- unbounded model calls across the entire provider result set

Any future search optimization must preserve these invariants or update this contract and its Golden Search tests in the same PR.


## Semantic resilience invariant

Semantic Job Context is not allowed to be all-or-nothing.

- the bounded shortlist is evaluated in small chunks;
- at most two semantic chunks run concurrently;
- one failed/slow chunk must not erase successful chunks;
- failed jobs are recorded explicitly in search diagnostics;
- if a job was selected into the bounded semantic shortlist and its semantic chunk fails, it may degrade to **Possible** rather than disappear;
- deterministic specialist conflicts remain **Outside** even during semantic outage;
- jobs outside the bounded semantic shortlist do not get promoted by outage fallback.

A provider outage must never turn a healthy retrieved market into a one-result page solely because semantic assessment failed.

## Retrieval completion invariant

Raw result count alone is not enough to stop provider retrieval.

Before the search may stop with `enough_results`:

1. every explicit target role must have run at least once; and
2. every bounded semantic market-title expansion must have run at least once.

Aggregator company/title combinations may remain after that point because named-company direct portals run independently and the broad role/semantic market coverage is already complete.
