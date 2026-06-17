# WebOps Forge Commercialization Plan

WebOps Forge should become the reusable open-core runtime for deterministic, auditable web operations.

It is not a general browser agent. It is a production control layer around browser workflows.

## Product Positioning

For teams that run repeated logged-in web operations, WebOps Forge provides:

- deterministic workflow execution
- local and browser execution modes
- operation-level browser/API switching
- run history and evidence
- approval gates
- rate limits
- blocked-state reporting
- private adapter boundaries
- a Studio UI for operators and developers

## Current Product Slice

Implemented:

- SDK workflow runner
- dry-run driver
- optional Playwright driver
- memory and file evidence stores
- rate limiter
- structured errors
- approval workflow action
- local Studio HTTP server
- Studio registry center for sites, pages, actions, and operations
- workflow library persistence
- asynchronous run queue
- browser/account profile registry
- profile session check metadata and API
- operation action with browser/API branches
- workflow generation from registered operations
- API call action with dry-run fixtures and Playwright browser-session support
- profile lease and release around runs
- run cancellation and retry
- persisted run history
- evidence timeline and artifact serving
- audit trail
- workflow validation
- bundle import/export
- Node test coverage
- CI workflow
- npm package metadata and binary entrypoint

## Commercial Target

The commercial-ready target is:

```text
workflow design -> dry-run validation -> browser execution -> evidence review -> blocked-state recovery -> private adapter integration
```

The product must be good enough for a private business adapter, such as a 1688 sourcing adapter, to rely on it without copying execution, evidence, queue, or UI code.

## Product Milestones

### Milestone 1: Local Studio Runtime

Status: implemented.

Acceptance:

- create and edit workflows
- run dry-run workflows
- run Playwright workflows when Playwright is installed
- persist runs and evidence
- view outputs, events, errors, and artifacts
- gate risky steps through approval context or policy

### Milestone 2: Browser Worker Readiness

Status: partially implemented.

Needed:

- persistent profile registry: implemented
- profile session check: implemented
- worker health endpoint
- profile lock and lease model: implemented for local queue
- per-profile rate limits
- run cancellation: implemented
- retry policy: implemented as manual retry
- blocked-state classification
- browser screenshot preview

### Milestone 3: Workflow Authoring Quality

Status: partially implemented.

Needed:

- schema-aware editor validation
- API workflow validation: implemented
- site/page/action/operation registry: implemented
- operation-to-workflow builder: implemented
- step builder from registered actions: partially implemented
- selector test action
- workflow version diff
- run comparison
- reusable driver fixtures
- API response fixtures for dry-runs: implemented
- import/export workflow bundle: implemented

### Milestone 4: Operations Governance

Status: planned.

Needed:

- role-aware approval policy
- audit export
- redaction policy
- artifact retention policy
- secrets boundary documentation
- queue concurrency controls
- webhooks for run lifecycle events

### Milestone 5: Adapter Ecosystem

Status: planned.

Needed:

- adapter SDK conventions
- operation mode policy conventions: partially implemented
- private adapter template
- platform-specific workflow packs outside the open repo
- adapter test harness
- fixture capture and replay
- version compatibility matrix

## Open-Core Boundary

Keep in this open project:

- workflow runtime
- Studio UI
- generic browser drivers
- evidence and artifact handling
- rate limiting primitives
- approval gate primitives
- blocked-state primitives
- adapter SDK conventions

Keep private:

- credentials
- customer data
- supplier scoring
- platform selectors that create business advantage
- message templates
- account-health tactics
- platform-specific recovery playbooks

## Quality Bar

Before a stable release:

- Node 18/20/22 CI stays green
- Studio can run from a clean clone
- package dry-run is clean
- docs describe all public APIs
- browser workflows can run against a controlled test page
- security policy explains credential and CAPTCHA boundaries
- private adapter integration has at least one real read-only workflow using the public API
