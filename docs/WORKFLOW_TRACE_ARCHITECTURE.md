# Workflow Trace Architecture

## Purpose

A Sartho workflow should be diagnosable end to end without creating another
authority, score, governor or state machine.

The workflow trace is an opaque operational correlation id only.

It must never influence:
- Candidate Context
- matching
- Search relevance
- recommendation
- Career Direction
- application status
- résumé content
- retry policy

## Trace lifecycle

A live Search creates one workflow trace id.

That id is carried through:

Search
→ stored Search result
→ Save opportunity
→ jobs.rule_analysis
→ Deep Analysis
→ deep_analysis_summary
→ tailored résumé generation
→ application / pipeline status events

A role saved manually or through the browser extension receives a new trace at
Save time.

An old opportunity created before tracing receives a trace at the first
downstream operation that needs one.

## Persistence

No new database table or column is introduced.

The trace rides inside JSON already used for workflow handoff:
- search_results.results
- search_results.criteria
- jobs.rule_analysis
- jobs.deep_analysis_summary

Candidate Interaction metadata may include the same trace for application-stage
events.

## Continuity invariants

- duplicate re-saving of an existing job preserves its original trace;
- automatic rescoring preserves the trace;
- older stored JSON without a trace remains valid;
- malformed trace values are ignored rather than trusted;
- semantic or scoring refreshes must not manufacture a new workflow identity.

## Logging

Runtime stages emit structured log entries under the event name
workflow_trace.

The payload contains only operational metadata:
- workflowTraceId
- stage
- job id where relevant
- counts/statuses

Prompts, résumé text, evidence claims and user identity are never logged by the
trace helper.

## Current stages

- search.started
- search.completed
- opportunity.save_started
- opportunity.saved
- deep_analysis.started
- deep_analysis.completed
- deep_analysis.failed
- resume_generation.started
- resume_generation.completed
- resume_generation.failed
- pipeline.status_changed

## Operator use

When a workflow behaves unexpectedly, the trace id can be used to correlate the
runtime logs across the whole journey instead of reconstructing the sequence
from screenshots or separate request timestamps.

The trace explains what happened. It never decides what should happen.
