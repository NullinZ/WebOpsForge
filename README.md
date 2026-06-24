# WebOps Forge

WebOps Forge turns fragile exploratory browser work into deterministic, auditable web operations workflows.

It is designed for teams that need logged-in browser workflows, platform back-office operations, supplier portals, admin consoles, or repetitive web tasks that must be fast, reviewable, and recoverable.

Status: alpha. The core workflow runner, dry-run driver, optional Playwright driver, evidence stores, and basic tests are in place. The public API may still change before 1.0.

WebOps Forge is not an "LLM clicks the browser forever" agent. The intended pattern is:

```text
explore once -> define workflow -> execute with a driver -> capture evidence -> promote fixes back into the workflow
```

## Why This Exists

Free-form browser agents are useful during discovery, but production web operations need stronger guarantees:

- stable action plans
- profile-aware browser execution
- rate limits
- human approval gates
- screenshots and structured evidence
- deterministic extraction
- clear blocked states

WebOps Forge provides the open, reusable layer. Business-specific adapters, credentials, account strategy, and platform playbooks should live outside this package.

## Install

For dry-run and workflow validation:

```bash
npm install webops-forge
```

For real browser execution:

```bash
npm install webops-forge playwright
```

## Development

```bash
npm test
npm run check
npm run pack:dry-run
```

Start the local Studio:

```bash
npm start
```

Open:

```text
http://127.0.0.1:4177
```

Run the dry-run example:

```bash
node examples/dry-run-search.mjs
```

## WebOps Studio

WebOps Studio is the local commercial-grade control surface for WebOps Forge.

It includes:

- operation builder for read-only list/detail/media workflows
- workflow library and JSON editor
- registry center for sites, pages, page actions, and reusable operations
- dry-run and Playwright execution modes
- browser/account profile registry
- profile session check metadata
- operation-level UI/API execution switching
- one-click workflow generation from registered operations
- run input, context, and driver configuration
- queued run execution
- run cancellation and retry
- persisted run history
- evidence timeline
- structured output preview for arrays, detail objects, and media URLs
- artifact links for screenshots and dry-run captures
- approval gates through the `approval` workflow action
- blocked-state classification and recovery hints
- audit trail
- workflow validation
- bundle import/export

The Studio stores local state in `.webops-forge/` by default. Override it with:

```bash
WEBOPS_FORGE_DATA_DIR=/secure/path npm start
```

## Quick Start

```js
import {
  WebOpsRunner,
  createDryRunDriver,
  createMemoryEvidenceStore,
  defineWorkflow
} from "webops-forge";

const workflow = defineWorkflow({
  name: "search-demo",
  steps: [
    { id: "open", action: "goto", url: "https://example.local/search" },
    { id: "query", action: "fill", selector: "#q", value: "{{input.query}}" },
    { id: "submit", action: "click", selector: "#search" },
    { id: "extractTitle", action: "extract", selector: ".result-title", name: "title" },
    { id: "shot", action: "screenshot", name: "search-result" }
  ]
});

const driver = createDryRunDriver({
  pages: {
    "https://example.local/search": {
      selectors: {
        "#q": { value: "" },
        "#search": { text: "Search" },
        ".result-title": { text: "Clear storage case supplier" }
      }
    }
  }
});

const evidenceStore = createMemoryEvidenceStore();
const runner = new WebOpsRunner({ driver, evidenceStore });
const result = await runner.run(workflow, { input: { query: "storage case" } });

console.log(result.outputs.title);
console.log(evidenceStore.list());
```

## Real Browser Driver

```js
import { WebOpsRunner, createPlaywrightDriver, createRateLimiter } from "webops-forge";

const driver = await createPlaywrightDriver({
  browserType: "chromium",
  profileDir: "/secure/profiles/operator-01",
  headless: false
});

const runner = new WebOpsRunner({
  driver,
  rateLimiter: createRateLimiter({
    minDelayMs: 800,
    maxDelayMs: 2200,
    maxPerMinute: 20
  })
});
```

Use persistent profiles only on controlled machines. Do not store credentials or customer data inside reusable open-source workflows.

`minDelayMs` and `maxDelayMs` add a random pre-step pause before every workflow node. Studio enables this automatically for Playwright runs; override it per run with `driverConfig.humanTiming`:

```json
{
  "humanTiming": {
    "enabled": true,
    "minDelayMs": 1000,
    "maxDelayMs": 2400,
    "maxPerMinute": 20
  }
}
```

## Profiles And Logged-In Accounts

A Studio profile represents one execution identity. In browser mode, use one persistent `profileDir` per platform account:

```text
/secure/webops-profiles/1688-operator-01
/secure/webops-profiles/1688-operator-02
```

Log in once manually with that profile, then run workflows against it. The Profile editor stores:

- `name`: operator-facing label.
- `platform`: platform or tenant label.
- `accountLabel`: account name extracted from the page or entered manually.
- `loginState`: `unchecked`, `authenticated`, `logged-out`, or `unknown`.
- `sessionCheck`: URL and selector used by Studio's Check Session action.

Studio can check a profile by opening the configured URL and reading the account selector. It does not store account passwords and must not be used to bypass CAPTCHA, 2FA, or platform verification.

## Sites, Page Actions, And Operations

The Studio registry models reusable web operations before they become workflows:

- `sites`: platform or tenant-level targets, including base URL and profile strategy.
- `pages`: concrete page patterns under a site, including state and account selectors.
- `actions`: reusable page actions such as `goto`, `fill`, `click`, `extract`, or `apiCall`.
- `operations`: business-level capabilities that reference action IDs and can switch between browser and API execution branches.

Use the Registry tab to register these resources, then build a workflow from an operation. Private adapters can ship their own registry packs without putting credentials, account data, or proprietary selectors in the open-source package.

## Adapter SDK

Private platform integrations can register their sites, pages, actions, operations, workflows, and dry-run fixtures without copying Studio or runner code:

```js
import { createFixtureDriverConfig, createRegistryPack, defineAdapter } from "webops-forge";

export const adapter = defineAdapter({
  id: "example-marketplace-adapter",
  name: "Example Marketplace Adapter",
  registry: createRegistryPack({
    sites: [{ id: "example", name: "Example", baseUrl: "https://example.local", status: "ready" }]
  }),
  fixtures: {
    demo: {
      pages: {
        "https://example.local/search": {
          selectors: {
            ".card": {
              items: [
                {
                  selectors: {
                    ".title": { text: "Sample item" },
                    "img": { attributes: { src: "/sample.jpg" } }
                  }
                }
              ]
            }
          }
        }
      }
    }
  }
});

const driverConfig = createFixtureDriverConfig(adapter, "demo");
```

## Workflow Actions

Supported actions:

- `goto`: navigate to a URL.
- `waitFor`: wait for a selector.
- `click`: click a selector.
- `fill`: fill a field.
- `press`: press a key.
- `extract`: extract text, value, HTML, or an attribute.
- `extractList`: extract repeated cards, table rows, or grid items into an array.
- `extractDetail`: extract a page or panel into a named field object.
- `extractMedia`: extract image/video URLs, posters, source candidates, and media attributes.
- `paginate`: follow configured next-page links and write visited URLs when named.
- `apiCall`: call an HTTP endpoint and optionally write the response value to outputs.
- `operation`: wrap one business operation with switchable browser and API branches.
- `approval`: require a policy or context approval before continuing.
- `assertText`: fail if expected text is missing.
- `assertOutput`: fail if an output value does not include expected text.
- `screenshot`: capture evidence.
- `checkpoint`: add a named audit marker.

String fields support templates:

```text
{{input.query}}
{{context.accountName}}
{{outputs.resultTitle}}
```

## UI/API Operation Switching

Use `operation` when one business action can be executed either through UI automation or a platform API.

```js
{
  id: "searchSuppliers",
  action: "operation",
  mode: "{{context.operationModes.searchSuppliers}}",
  browserSteps: [
    { id: "openSearch", action: "goto", url: "https://example.local/search" },
    { id: "fillQuery", action: "fill", selector: "#q", value: "{{input.query}}" },
    { id: "extractTitle", action: "extract", selector: ".result-title", name: "title" }
  ],
  api: {
    method: "GET",
    url: "https://api.example.local/suppliers/search",
    query: { q: "{{input.query}}" },
    extract: "json.title",
    name: "title"
  }
}
```

Then switch the branch at run time:

```json
{
  "operationModes": {
    "searchSuppliers": "api"
  }
}
```

`apiCall` supports `method`, `url`, `query`, `headers`, `body` or `json`, `extract`, and `name`. In dry-run mode, configure `driverConfig.apiResponses`. In Playwright mode, set `session: "browser"` on the API branch when the request should reuse the browser context's cookies.

## Evidence

WebOps Forge includes:

- `createMemoryEvidenceStore()` for tests and local dry-runs.
- `createFileEvidenceStore({ dir })` for JSONL evidence plus artifacts.

Evidence is deliberately structured so operators can see what happened without replaying a whole browser session.

## Blocked States

Runs classify common blockers into named states such as `login_required`, `captcha_or_verification`, `selector_drift`, `empty_result`, `navigation_timeout`, `rate_limited`, `permission_denied`, and `profile_busy`. The serialized run error includes:

- `details.blockedState`
- `details.recoveryHint`
- `details.recoverable`

Use `classifyRunFailure(error)` or `detectBlockedState(error)` when building custom queues or adapter test harnesses.

## API Surface

The Studio exposes a local REST API:

- `GET /api/health`
- `GET /api/runtime`
- `GET /api/audit`
- `GET /api/export`
- `POST /api/import`
- `GET /api/workflows`
- `POST /api/workflows/validate`
- `POST /api/workflows`
- `GET /api/workflows/:id`
- `PUT /api/workflows/:id`
- `DELETE /api/workflows/:id`
- `POST /api/workflows/:id/runs`
- `GET /api/profiles`
- `POST /api/profiles`
- `GET /api/profiles/:id`
- `PUT /api/profiles/:id`
- `POST /api/profiles/:id/check-session`
- `DELETE /api/profiles/:id`
- `GET /api/runs`
- `GET /api/runs/:id`
- `POST /api/runs/:id/cancel`
- `POST /api/runs/:id/retry`
- `GET /api/runs/:id/events`
- `GET /api/runs/:id/artifacts/:name`

## Safety Boundaries

WebOps Forge should not be used to bypass CAPTCHA, platform verification, paywalls, or access controls.

Recommended production rules:

- require human approval before outbound messages, purchases, permission changes, or account-sensitive actions
- keep account profiles isolated
- rate-limit every platform workflow
- capture screenshots before and after risky operations
- route blocked states to a human instead of escalating blind retries

## Open-Core Boundary

Good open-source candidates:

- workflow runner
- action schema
- browser driver abstraction
- Playwright driver
- dry-run driver
- evidence storage
- rate limits
- blocked-state primitives

Keep private:

- platform credentials
- customer data
- supplier scoring rules
- platform-specific message playbooks
- account health tactics
- proprietary adapters

## License

MIT
