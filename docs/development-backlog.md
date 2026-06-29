# Development Backlog

This backlog tracks productization items that should not be left as code-only TODOs.

## Closed

### WOF-P0-001 Structured Data Extraction Layer

- Priority: P0
- Status: closed
- Area: runner, workflow schema, dry-run driver, Playwright driver, Studio output preview
- Summary: Add first-class list/detail/media extraction capabilities so WebOps Forge can read repeated cards, table rows, details, images, and videos as structured outputs.
- Acceptance: Workflows support `extractList`, `extractDetail`, `extractMedia`, pagination, normalized outputs, dry-run fixtures, and Studio previews for array/object/media results.
- Evidence: Implemented in runner/drivers/Studio output preview; `npm test` covers structured extraction and pagination.

### WOF-P0-002 Operation Builder Main Path

- Priority: P0
- Status: closed for P0 baseline
- Area: Studio UX
- Summary: Add a guided authoring flow for choosing a site/profile, opening a target page, picking action or data regions, mapping fields, testing previews, saving operations, and running them.
- Acceptance: A user can create a read-only search/list extraction operation without hand-editing workflow or driver JSON.
- Evidence: Studio Builder tab creates runnable read workflows with dry-run fixtures. Rich field-mapping UX remains under WOF-P1-008.

### WOF-P0-003 Evidence And Output Review

- Priority: P0
- Status: closed for P0 baseline
- Area: Studio runs, artifacts, evidence
- Summary: Upgrade run review from raw events/artifact links to operator-grade output review with tables, detail previews, media gallery, screenshot timeline, and export.
- Acceptance: Completed read workflows show structured outputs and media previews; failed runs show blocker, step, URL, and screenshot.
- Evidence: Runs panel now renders output tables, detail tables, and media cards while retaining raw JSON and evidence timeline.

### WOF-P0-004 Blocked-State Classification And Recovery

- Priority: P0
- Status: closed
- Area: runner, drivers, Studio runs
- Summary: Classify blocked states such as login required, CAPTCHA, selector drift, empty result, unexpected modal, navigation timeout, rate limit, permission denied, and profile busy.
- Acceptance: Runs expose named blocked states, recovery hints, and retry/resume paths where possible.
- Evidence: Added shared blocked-state classifier; runner evidence, queue run errors, and Studio activity summaries expose `blockedState`, `recoveryHint`, and `recoverable`.

### WOF-P0-005 Adapter SDK And Fixture Harness

- Priority: P0
- Status: closed
- Area: SDK, examples, tests
- Summary: Define adapter conventions for private registry packs, fixture packs, operation defaults, and policy boundaries.
- Acceptance: A private adapter can register sites/pages/operations and test list/detail/media workflows against controlled fixtures without copying Studio or runner code.
- Evidence: Added `defineAdapter`, `createRegistryPack`, `createFixtureDriverConfig`, and `installAdapterToStore` with tests.

## Open

### WOF-P1-006 Commercial Open-Source Packaging

- Priority: P1
- Status: open
- Area: npm packaging, docs
- Summary: Split public docs from internal worklog/evidence and ensure package contents are clean for an open-source release.
- Acceptance: `npm pack --dry-run` excludes `docs/worklog`, state files, backups, and internal evidence while retaining public README, API docs, examples, and security docs.
- Evidence: `package.json` currently includes the whole `docs` directory.

### WOF-P1-007 Governance

- Priority: P1
- Status: open
- Area: security, evidence, operations
- Summary: Add redaction policy, artifact retention policy, audit export, role-aware approvals, webhook lifecycle events, and secrets-boundary examples.
- Acceptance: Sensitive run inputs and artifacts can be redacted/retained by policy; operators can export audit records.
- Evidence: See `docs/COMMERCIALIZATION_PLAN.md`.

### WOF-P1-008 Authoring Quality

- Priority: P1
- Status: open
- Area: Studio authoring
- Summary: Add visual field-mapping controls, picker-to-field mapping, selector tests, schema-aware editor validation, workflow version diff, run comparison, reusable driver fixtures, and fixture capture/replay.
- Acceptance: Users can map list/detail/media fields without editing JSON, compare workflow versions and run results, test selectors before running, and reuse fixtures for repeatable validation.
- Evidence: See `docs/COMMERCIALIZATION_PLAN.md`.

### WOF-P1-009 Browser Worker Readiness

- Priority: P1
- Status: open
- Area: browser worker, profiles, queue
- Summary: Add worker health endpoint, per-profile queue visibility, profile screenshot preview, session freshness warning, and clear Chrome/CDP versus Playwright profile handling.
- Acceptance: Operators can see whether the browser worker and profile sessions are healthy before starting a run.
- Evidence: See `docs/COMMERCIALIZATION_PLAN.md`.

### WOF-P1-011 Front Chrome Executor

- Priority: P1
- Status: closed
- Area: Chrome/CDP, extension executor, runner
- Summary: Execute `fill`, `click`, `waitFor`, and extraction steps in an already-open ordinary Chrome profile after front-window URL handoff.
- Acceptance: Runs against a busy real Chrome profile preserve the existing login/plugin session, open the target URL, then continue browser actions through CDP or the extension executor without falling back to Playwright profile takeover.
- Evidence: 2026-06-27 live `workflow-mqme1i81` run `run_e6f4181de8f8460aa4` opened `https://douyin.com/` through handoff, then correctly stopped at `fill` with `chrome_profile_handoff_unsupported_action`. Closed after adding the Studio extension-executor job API, picker-extension polling executor, handoff-driver executor dispatch, and tests covering locked Chrome profile completion through the extension executor.

### WOF-P1-012 Douyin Live Selector/Profile Verification

- Priority: P1
- Status: open
- Area: real-site workflow validation, profiles, selector picker
- Summary: Validate the Douyin DM group workflow against a logged-in local browser profile, refresh selectors with the picker, and run once to the approval gate before allowing any real outbound message.
- Acceptance: A logged-in profile can open Douyin, pass `checkSession`, open DM, select the target group, extract visible messages, generate `replyDraft`, and block at `approval` with evidence. A second approved run may send only after explicit operator approval.
- Evidence: 2026-06-29 dry-run and isolated Studio API validation passed; Chrome real-site probe reached a Douyin page but browser automation timed out before a DOM/login-state read. No credentials were stored and no real message was sent.

### WOF-P2-010 Public Demo, Docs, And Accessibility QA

- Priority: P2
- Status: open
- Area: docs, examples, Studio QA
- Summary: Add public demo H5 pages, quickstart assets, adapter template docs, UI copy cleanup, keyboard/accessibility QA, and compatibility matrix.
- Acceptance: New open-source users can understand and evaluate WebOps Forge without private business systems.
- Evidence: See `docs/productization-gap-analysis-2026-06-24.md`.
