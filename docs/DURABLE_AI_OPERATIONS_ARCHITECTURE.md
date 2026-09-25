# Durable AI Operations Architecture

## Purpose

Long-running AI requests must not exist only as an HTTP request in memory.

Deep Analysis and tailored résumé generation still use the existing synchronous
user experience today, but every run is now coordinated by a durable database
record underneath that request.

This gives Sartho recoverability now and a worker-ready boundary later without
changing matching authority or product semantics.

## Durable ledger

Table: durable_ai_operations

It stores operational metadata only:
- user id
- operation kind
- job/resource id
- client request id
- workflow trace id
- running / succeeded / failed status
- attempt count
- timestamps
- bounded error text
- small result references such as job/application ids

It never stores:
- prompts
- résumé text
- evidence claims
- model output
- candidate profile content

## Idempotency

Each deliberate click creates one UUID request id.

The same request id may not create the same operation twice.

In addition, a partial unique index guarantees that only one running operation
of a given kind may exist for the same user and job. This protects against a
second click after a network uncertainty even when it carries a new request id.

## Operation states

started
The caller owns the work and may invoke the AI provider.

already_running
Another fresh invocation owns the same work. The caller must not spend AI again.

already_succeeded
This exact request already completed. The route reuses the stored authoritative
result/reference instead of generating again.

reclaim
A failed operation, or a running operation older than the lease threshold, may
be retried. The attempt count advances.

## Stale recovery

A running operation older than three minutes is considered abandoned.

The next request can reclaim it. This is deliberately longer than the current
120-second route budget so a legitimate invocation is not stolen while still
running.

## Current operations

- deep_analysis
- resume_generation

The user-facing behavior remains synchronous for now. This is intentional:
durability is introduced underneath the current UX before background workers
are introduced.

## Future worker handoff

A future queue/worker can claim the same ledger without changing the product
contract:

route creates durable operation
→ worker claims running work
→ worker performs AI call
→ worker commits authoritative product data
→ worker marks operation succeeded/failed
→ UI polls operation status

No new matching, scoring or Career Context authority is required.

## Failure boundaries

The durable operation ledger coordinates execution only.

It never decides:
- whether a role matches
- what score a role receives
- what evidence is true
- what a résumé may claim
- what application status means

Those remain owned by the existing Career Conductor, evidence model and
application workflow.
