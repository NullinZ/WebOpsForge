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

- workflow library and JSON editor
- dry-run and Playwright execution modes
- browser/account profile registry
- profile session check metadata
- operation-level UI/API execution switching
- run input, context, and driver configuration
- queued run execution
- run cancellation and retry
- persisted run history
- evidence timeline
- artifact links for screenshots and dry-run captures
- approval gates through the `approval` workflow action
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
import { WebOpsRunner, createPlaywrightDriver } from "webops-forge";

const driver = await createPlaywrightDriver({
  browserType: "chromium",
  profileDir: "/secure/profiles/operator-01",
  headless: false
});

const runner = new WebOpsRunner({ driver });
```

Use persistent profiles only on controlled machines. Do not store credentials or customer data inside reusable open-source workflows.

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

## Workflow Actions

Supported actions:

- `goto`: navigate to a URL.
- `waitFor`: wait for a selector.
- `click`: click a selector.
- `fill`: fill a field.
- `press`: press a key.
- `extract`: extract text, value, HTML, or an attribute.
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
