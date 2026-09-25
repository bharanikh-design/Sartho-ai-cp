# Platform Information Flow Audit — 2026-09-25

## Purpose

Sartho already has strong individual capabilities: résumé ingestion, Career Profile, Career Direction, Search, Google Jobs, opportunity scoring, deep analysis, extension ingestion, applications, résumé tailoring, interview preparation, notifications and outcomes.

The risk is feature isolation: multiple components independently reconstructing the candidate, match meaning or next action. This audit establishes one information spine and separates authority from presentation.

## The information spine

Master résumé / approved evidence
→ Career Truth
→ Career Direction + Search Brief
→ Candidate Workflow Context
→ Career Conductor
→ Search + Opportunity Evaluation
→ Deep Analysis / Résumé Prep / Interview Prep
→ Application Outcomes
→ Interaction Memory
→ back into Candidate Workflow Context

Learned behavior may refine future discovery, but it never overwrites Career Truth or explicit Career Direction.

## Authority hierarchy

1. Career Truth: imported résumé facts, career roles, approved evidence and explicit profile facts.
2. Explicit Intent: Career Direction, Search Brief and explicit constraints.
3. Learned Affinity: weak, revisable behavior and market evidence.

One click is curiosity. Save/import is stronger. Applying is user intent. Interview/offer is market-positive evidence. Withdrawal is negative preference. Rejection is market feedback, never user dislike.

## Conductor contract

The Career Conductor prepares one Candidate Workflow Context, persists the exact Candidate Context snapshot in use, and exposes the single opportunity evaluation entry point.

Search, preview, save and rescoring must not independently reconstruct candidate inputs or call a different matcher.

## Handoff rules

- Candidate Context → Search uses one typed Search Intent handoff.
- Every search stores the Candidate Context fingerprint used to execute it.
- Search, preview, save and rescore all use the same opportunity scoring authority.
- Deep analysis adds richer requirement evidence but does not overwrite the canonical match score with another formula.
- Résumé and interview preparation consume durable opportunity/evidence outputs and do not redefine Career Truth or match authority.
- Pipeline outcomes flow into Interaction Memory and then back into Candidate Context on the next conductor preparation.

## Defects found and corrected in the current branch

### Saved-job rescoring was a second matcher
Rescoring called the low-level analysis function directly and omitted normal title-fit context. It now uses the Career Conductor and the same opportunity scoring path as Search/Preview/Save.

### Deep analysis was a second score authority
It replaced overall_match with a separate mandatory/preferred formula that knew nothing about specialist contradictions. It now remains richer decision evidence and no longer overwrites the canonical score.

### Résumé import did not propagate Career Truth changes
Auto-approved imported evidence could leave existing saved opportunities stale. Completed imports now trigger conductor-backed rescoring.

### Editing approved evidence did not propagate
Changing an already-approved claim/context did not rescore unless approval status changed. Semantic edits to approved evidence now propagate.

### Search reconstructed its own candidate
Search separately loaded Career Workspace and Search Preferences. It now consumes the typed Candidate Context → Search Intent handoff.

### Interactive and scheduled Search could diverge
Context snapshotting initially happened only in the interactive route. Conductor preparation now lives inside the shared search engine, so live Search, test alerts and scheduled alerts use the same path.

### Stored Search could lose provenance
The context fingerprint was written but not preserved by the backward-compatible criteria reader. Stored search normalization now keeps it.

### Specialist protection was isolated on unmerged PR #206
The specialist-title correction and regression tests have now been integrated into the orchestration branch so the conductor does not institutionalize the old 98% defect.

## Existing modules that are not the conductor

Product Journey is the canonical readiness/progression model for UI setup. It is not a decision engine.

Dashboard Command Centre is a presentation/prioritization layer over durable state. It must not become a second matcher.

WorkflowHandoff is navigation UX. A button between pages is not a data handoff.

## Future development rules

1. No new matching entry point.
2. No feature-local candidate model.
3. No inferred behavior may overwrite explicit intent.
4. No AI output becomes Career Truth without a grounded or explicit transition.
5. No second overall_match writer.
6. Every source mutation declares downstream propagation.
7. Every durable result should be traceable to the context/version that produced it.
8. Presentation layers read authorities; they do not become authorities.
9. Learn progressively, not aggressively.
10. One-way data loss or stale dependent state is a workflow defect.

## Remaining deliberate boundaries

- Build semantic Job Context so job meaning and learned affinity are compared semantically rather than by title strings.
- Move Career Direction AI suggestions onto Candidate Workflow Context, using learned affinity only as weak steering and approved evidence as factual grounding.
- Add context/version provenance to saved opportunities, not only search result sets.
- Add end-to-end regression proof: Career Truth mutation → context fingerprint change → opportunity rescore → search result change.
- Add handoff freshness observability so stale state is diagnosable without screenshot-driven troubleshooting.

## Release invariant

A feature is not complete because its own tests are green. Any feature changing candidate understanding or opportunity decisions must identify its authoritative input, conductor/handoff, durable output, downstream consumers, duplicate-authority prevention and provenance trail.