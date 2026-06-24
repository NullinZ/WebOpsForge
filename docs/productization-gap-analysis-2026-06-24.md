# WebOps Forge Productization Gap Analysis

Date: 2026-06-24

## Product Goal

WebOps Forge should be positioned as an AI-assisted H5 page operation engine for turning visual web work into repeatable, auditable workflows.

The core user outcome is:

```text
capture one visual operation path -> model actions and data reads -> validate safely -> run with a logged-in profile -> review outputs and evidence -> repair drift
```

This is different from a generic browser agent. The product should make repeated H5 operations reliable enough for platform back-office work, supplier portals, admin consoles, visual sourcing, and list/detail/media reading.

## Verified Current State

- Local Studio is live on `127.0.0.1:4177` and `/api/health` returns OK.
- `npm run check` passes.
- `npm run pack:dry-run` succeeds.
- Studio already has workflow, profile, run history, registry, picker, evidence, import/export, retry, cancel, and UI/API operation switching.
- The current registry model is `sites -> pages -> actions -> operations`.
- The Chrome picker captures `targetIdentity` and selector candidates, which is stronger than copy-selector tooling.

## Product Diagnosis

The project has a usable runtime kernel and a useful Studio prototype, but the product experience is still closer to an engineering control console than a commercial open-source product.

The current primary path asks users to understand Graph, Registry, Workflow JSON, Run Config, Driver JSON, profile state, and picker events before they can complete one business operation. That is acceptable for internal development, but too much for a first-class open-source product.

The biggest capability gap is not clicking. The gap is structured data reading:

- list rows and cards
- detail fields
- image and video URLs
- pagination and lazy loading
- downloadable artifacts
- normalized output previews
- reliable reruns when selectors drift

## External Reference Patterns

The P0 direction intentionally follows proven patterns from current browser-automation and workflow systems:

- Stagehand and Skyvern: keep AI-assisted discovery separate from deterministic `act`/`extract` style execution and schema-shaped outputs.
- Browser Use: preserve a real browser profile/action boundary and make recovery loops explicit instead of hiding failures behind free-form retries.
- Crawlee: treat list/detail/media extraction and dataset-like outputs as first-class product value, not incidental scrape code.
- Playwright: prefer stable locators, auto-waiting behavior, and evidence/trace-style debugging over raw coordinate clicks.
- Temporal and n8n: expose durable execution state, retry/blocked paths, and debuggable run history as product primitives.

## P0 Gaps

### WOF-P0-001: Structured Data Extraction Layer

Current `extract` reads one selector into one output. The product needs first-class actions for repeated H5 data reads:

- `extractList`: read repeated cards, table rows, or grid items into an array.
- `extractDetail`: map a detail page into named fields.
- `extractMedia`: capture image/video sources, posters, thumbnails, dimensions, and downloadable URLs.
- `paginate`: follow next-page, load-more, infinite-scroll, or page-number patterns.
- `normalizeOutput`: coerce text, number, URL, currency, date, and media fields.

Acceptance:

- A workflow can extract a list of result cards with title, URL, image, price-like text, and supplier-like text.
- A workflow can open a detail page and extract a structured object.
- Outputs appear in Studio as a table/object preview, not only raw JSON.
- Dry-run fixtures support list/detail/media extraction.

Status after P0 implementation:

- Implemented `extractList`, `extractDetail`, `extractMedia`, and `paginate` in workflow schema, runner dispatch, dry-run driver, Playwright driver, and TypeScript declarations.
- Added dry-run tests for structured list/detail/media outputs and pagination.

### WOF-P0-002: Operation Builder Main Path

Studio needs one guided authoring path:

```text
choose site/profile -> open target page -> pick action or data region -> map fields -> test preview -> save operation -> run
```

Graph, Registry, Workflow JSON, and Driver JSON should remain available as advanced panels, but they should not be the first path for a new user.

Acceptance:

- A new user can create a read-only search/list extraction workflow without editing JSON.
- The picker can apply a target as an action step or a data-field selector.
- The operation builder shows missing required pieces before run.

Status after P0 implementation:

- Added a Studio Builder tab as the default authoring path for read-only page operations.
- Builder creates a runnable list/detail/media workflow with dry-run fixture data.
- Rich field-mapping controls and picker-to-field mapping remain P1 authoring-quality work.

### WOF-P0-003: Evidence And Output Review

Runs need an operator-grade review surface:

- outputs table
- detail object preview
- media gallery
- screenshot timeline
- failed-step snapshot
- exported JSON/CSV artifact

Acceptance:

- Completed read workflows show structured outputs in the Runs panel.
- Media artifacts are previewable without exposing local internal paths as product data.
- Failed browser runs show the exact blocker, step, URL, and screenshot.

Status after P0 implementation:

- Runs panel now previews output arrays as tables, detail objects as field tables, and media outputs as linked media cards.
- Raw run JSON remains available for developer debugging.

### WOF-P0-004: Blocked-State Classification And Recovery

Current failures are mostly generic failed/blocked records. Commercial operations need named blocked states:

- login required
- CAPTCHA or platform verification
- selector drift
- empty result
- unexpected modal
- navigation timeout
- rate limited
- permission denied
- profile busy

Acceptance:

- Runner and Studio classify common blocked states.
- Runs expose recommended recovery actions.
- Retry can resume with corrected selector/profile/input where possible.

Status after P0 implementation:

- Added shared blocked-state classification for login, verification, selector drift, empty results, timeouts, rate limits, permission issues, profile busy, and approvals.
- Runner evidence, queued runs, Studio run summaries, and exported run errors expose `blockedState`, `recoveryHint`, and `recoverable`.

### WOF-P0-005: Adapter SDK And Fixture Harness

Open-source value depends on private adapters being easy to build without copying Studio or runner code.

Acceptance:

- A `createAdapter` convention exists for registering sites, pages, operations, fixtures, and policy defaults.
- A private adapter can ship a registry pack and fixture pack.
- CI includes a controlled test H5 page for list/detail/media workflows.

Status after P0 implementation:

- Added `defineAdapter`, `createRegistryPack`, `createFixtureDriverConfig`, and `installAdapterToStore`.
- Added tests for adapter fixture reuse and StudioStore registry/workflow installation.

## P1 Gaps

### WOF-P1-006: Commercial Open-Source Packaging

The npm package currently includes the whole `docs` folder, which also pulls internal worklog files. Public package contents should separate:

- public docs
- API docs
- examples
- internal worklogs
- audit evidence

Acceptance:

- `npm pack --dry-run` contains only public-facing docs and examples.
- Worklog/state/evidence directories are excluded from npm packages.

### WOF-P1-007: Governance

Needed for product-level use:

- redaction policy
- artifact retention policy
- audit export
- role-aware approvals
- webhook lifecycle events
- secrets boundary examples

### WOF-P1-008: Authoring Quality

Needed:

- selector test action
- schema-aware editor validation
- workflow version diff
- run comparison
- reusable driver fixtures
- fixture capture/replay

### WOF-P1-009: Browser Worker Readiness

Needed:

- worker health endpoint
- per-profile queue visibility
- profile screenshot preview
- session freshness warning
- clear handling for Chrome/CDP versus Playwright profile modes

## P2 Gaps

- public demo site with repeatable list/detail/media pages
- quickstart video or GIF
- example adapter template
- UI copy cleanup and onboarding text
- stronger keyboard and accessibility QA
- package compatibility matrix
- docs split for user, developer, adapter author, and operator

## Recommended Next Build Order

1. Build structured extraction actions and dry-run fixtures.
2. Add Studio output preview for arrays, detail objects, and media fields.
3. Add an Operation Builder path for read-only workflows.
4. Add blocked-state classification with recovery hints.
5. Add adapter SDK template and controlled demo H5 app.
6. Clean public packaging and docs before pushing a broader open-source release.

The first commercial proof should be a read-only workflow:

```text
search page -> extract list cards -> open one detail -> extract media and detail fields -> save evidence -> export structured results
```

Outbound messages, purchases, account changes, and any commercial commitment should stay behind approval gates until the read-only engine is reliable.
