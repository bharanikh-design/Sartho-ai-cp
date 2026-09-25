# Sartho Platform Reliability Foundation

This document defines the first reliability slice for Sartho. It is deliberately small: identity, health, trace, dispatch and proof. It does not change user-facing workflows.

## Goals

1. **Health** — every platform capability should be able to say whether it is ready, degraded or not ready.
2. **Trace** — every workflow should carry a workflow ID and trace ID, and record what happened stage by stage.
3. **Recovery** — failure handling should state what survived and what recovery path was used.
4. **Ownership** — each platform concern should have one authority, not overlapping observers.

## Added modules

```text
lib/platform/manifest.ts
lib/platform/deployment-contract.ts
lib/platform/workflow-trace.ts
lib/platform/workflow-dispatcher.ts
lib/platform/health.ts
```

## Platform manifest

The manifest is the single operational identity object for Sartho:

```text
App name
App version
Git SHA
Schema version
Required migration version
Build timestamp
Deployment environment
```

It reads only stable build/runtime values and returns no secrets. Missing values are represented as `null` or `unknown` instead of guessed.

## Deployment contract

The deployment contract aggregates component checks into one of three states:

```text
READY
DEGRADED
NOT_READY
```

A missing required dependency makes the whole contract `NOT_READY`. Optional degradation keeps the contract `DEGRADED` so the cockpit can show reduced capability without blocking the whole platform.

## Workflow trace

Workflow tracing records:

```text
Workflow ID
Trace ID
Workflow name
Start/finish time
Stage names
Stage duration
Warnings
Retries
Failure class
Recovery note
```

The trace intentionally records bounded, safe fields. It records error class names, not raw error messages, prompts, credentials or user payloads.

## Dispatcher seam

The dispatcher has one behavior today:

```text
Immediate
```

It also defines `queued` as a future mode, but rejects it explicitly until a real queue backend exists. This avoids the dangerous lie that durable async execution happened when it did not.

## Platform health snapshot

The platform health snapshot prepares a cockpit-ready payload covering:

```text
Application
Version
Environment
Schema
Migrations
Database/storage
AI
Search
Notifications
Workflow trace
Dispatcher
Queue
```

## Non-goals

This PR does not touch:

```text
Candidate context
Resume flows
Interview prep
Homepage
Matching
Scoring
UX
Database mutations
Existing user journeys
```

## Proof

Regression coverage lives in:

```text
lib/platform/reliability.test.ts
```

Covered behaviors:

```text
Manifest normalization
Deployment contract aggregation
Workflow trace stages/warnings/retries/recovery
Failure safety
Immediate dispatcher behavior
Queued-mode rejection
Health snapshot construction
```
