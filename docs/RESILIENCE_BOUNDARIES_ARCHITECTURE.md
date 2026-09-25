# Resilience Boundaries — Architecture Contract

## Principle

Core Truth must not depend on enrichment.
Enrichment must not depend on telemetry.
Presentation must not require every derived dataset to succeed.

A dependency is allowed to take down its parent workflow only when the parent cannot produce an honest answer without it.

## Authority classes

### Core / required
- authentication/session
- Career Profile / approved evidence when matching is requested
- the job being analysed for a single-job workflow
- the source résumé during an import
- the explicit Search Brief for executing a search

### Enrichment / optional
- Interaction Memory / learned affinity
- semantic enrichment of a bounded candidate set
- Google Drive connection status
- resume-import metadata when approved Career Evidence already exists

### Derived / presentation
- Dashboard Jobs
- Dashboard Applications
- Admin activity metrics
- Admin anonymous audience metrics
- Journey Search readiness when Search Preferences cannot be read

## Current boundaries

### Candidate Workflow
Required: Career Workspace and Search Preferences.
Optional: Interaction Memory.
If Interaction Memory fails, Candidate Context is built with no learned affinity.

### Journey
Required: profile, target lanes, roles/evidence.
Optional: Search Preferences and resume-import metadata.
If Search Preferences fails, Search is marked incomplete.
If resume-import metadata fails, approved Career Evidence may still prove the résumé step.

### Dashboard
Required: Journey / Career core.
Optional: Jobs, Applications and Drive connection status.
If optional data fails, the dashboard renders the Career core and shows a partial-data notice.

### Admin
Required: account identity list.
Optional: profiles, activity, résumé, direction, Search Brief, search results, jobs/outcomes and anonymous audience.
Each optional source fails independently and unavailable sources are named.

## Collection rule

For a collection, ask whether one failed item should erase successful items.
If no, use partial-success semantics and expose degradation diagnostics.

## Atomic-artifact rule

Single coherent artifacts may remain all-or-nothing when partial output would be misleading.
Examples: résumé import extraction, one job Deep Analysis, one tailored résumé, one Interview Prep pack, one role-ranking response.
These workflows must leave underlying source data unchanged on failure.

## Forbidden regressions

- optional telemetry in the same fatal Promise.all as Career Truth
- one failed collection item erasing successful siblings
- UI hiding valid source data because a derived query failed
- optional integration status blocking core navigation
- telemetry pages rendering empty as if there were no users when one metric source failed
- silent degradation without logs or visible diagnostics where appropriate