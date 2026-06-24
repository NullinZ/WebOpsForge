# Development Backlog

This backlog tracks productization items that should not be left as code-only TODOs.

## Open

### WOF-P0-001 Structured Data Extraction Layer

- Priority: P0
- Status: open
- Area: runner, workflow schema, dry-run driver, Playwright driver, Studio output preview
- Summary: Add first-class list/detail/media extraction capabilities so WebOps Forge can read repeated cards, table rows, details, images, and videos as structured outputs.
- Acceptance: Workflows support `extractList`, `extractDetail`, `extractMedia`, pagination, normalized outputs, dry-run fixtures, and Studio previews for array/object/media results.
- Evidence: See `docs/productization-gap-analysis-2026-06-24.md`.

### WOF-P0-002 Operation Builder Main Path

- Priority: P0
- Status: open
- Area: Studio UX
- Summary: Add a guided authoring flow for choosing a site/profile, opening a target page, picking action or data regions, mapping fields, testing previews, saving operations, and running them.
- Acceptance: A user can create a read-only search/list extraction operation without hand-editing workflow or driver JSON.
- Evidence: See `docs/productization-gap-analysis-2026-06-24.md`.

### WOF-P0-003 Evidence And Output Review

- Priority: P0
- Status: open
- Area: Studio runs, artifacts, evidence
- Summary: Upgrade run review from raw events/artifact links to operator-grade output review with tables, detail previews, media gallery, screenshot timeline, and export.
- Acceptance: Completed read workflows show structured outputs and media previews; failed runs show blocker, step, URL, and screenshot.
- Evidence: See `docs/productization-gap-analysis-2026-06-24.md`.

### WOF-P0-004 Blocked-State Classification And Recovery

- Priority: P0
- Status: open
- Area: runner, drivers, Studio runs
- Summary: Classify blocked states such as login required, CAPTCHA, selector drift, empty result, unexpected modal, navigation timeout, rate limit, permission denied, and profile busy.
- Acceptance: Runs expose named blocked states, recovery hints, and retry/resume paths where possible.
- Evidence: See `docs/productization-gap-analysis-2026-06-24.md`.

### WOF-P0-005 Adapter SDK And Fixture Harness

- Priority: P0
- Status: open
- Area: SDK, examples, tests
- Summary: Define adapter conventions for private registry packs, fixture packs, operation defaults, and policy boundaries.
- Acceptance: A private adapter can register sites/pages/operations and test list/detail/media workflows against controlled fixtures without copying Studio or runner code.
- Evidence: See `docs/productization-gap-analysis-2026-06-24.md`.

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
- Summary: Add selector tests, schema-aware editor validation, workflow version diff, run comparison, reusable driver fixtures, and fixture capture/replay.
- Acceptance: Users can compare workflow versions and run results, test selectors before running, and reuse fixtures for repeatable validation.
- Evidence: See `docs/COMMERCIALIZATION_PLAN.md`.

### WOF-P1-009 Browser Worker Readiness

- Priority: P1
- Status: open
- Area: browser worker, profiles, queue
- Summary: Add worker health endpoint, per-profile queue visibility, profile screenshot preview, session freshness warning, and clear Chrome/CDP versus Playwright profile handling.
- Acceptance: Operators can see whether the browser worker and profile sessions are healthy before starting a run.
- Evidence: See `docs/COMMERCIALIZATION_PLAN.md`.

### WOF-P2-010 Public Demo, Docs, And Accessibility QA

- Priority: P2
- Status: open
- Area: docs, examples, Studio QA
- Summary: Add public demo H5 pages, quickstart assets, adapter template docs, UI copy cleanup, keyboard/accessibility QA, and compatibility matrix.
- Acceptance: New open-source users can understand and evaluate WebOps Forge without private business systems.
- Evidence: See `docs/productization-gap-analysis-2026-06-24.md`.
