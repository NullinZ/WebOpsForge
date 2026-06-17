# FDE 1688 Integration Boundary

This document describes how a private FDE 1688 adapter should use WebOps Forge.

## Rule

WebOps Forge owns the generic execution layer.

The private 1688 project owns:

- 1688 selectors
- account and profile assignments
- operation mode policy, such as when to prefer API versus UI automation
- supplier candidate normalization
- sourcing-specific scoring
- inquiry message templates
- outbound communication policy
- customer data

## Recommended Package Shape

```text
FDE-SourcingCopilot/
  packages/platform-1688/
    src/
      keyword-search-workflow.mjs
      image-search-workflow.mjs
      detail-extraction-workflow.mjs
      adapter.mjs
      fixtures/
```

The adapter imports WebOps Forge:

```js
import {
  WebOpsRunner,
  createPlaywrightDriver,
  createFileEvidenceStore,
  defineWorkflow
} from "webops-forge";
```

## First Real Milestone

Build read-only keyword search first.

Do not start with messaging.

Acceptance:

- run with a controlled logged-in profile
- submit a keyword search
- extract search result cards
- normalize candidate title, URL, price, MOQ, image URL, supplier name
- capture search result screenshot
- write structured evidence
- stop on CAPTCHA, login verification, or unexpected modal

## Profile Strategy

Use one WebOps Forge profile per 1688 account. The private adapter should assign stable names such as:

```text
1688-operator-01
1688-operator-02
```

Each Playwright profile should point at a separate persistent `profileDir`. The operator logs in manually once, including CAPTCHA or 2FA if required. WebOps Forge can then run a session check by opening a configured 1688 page and extracting the visible account label with `accountSelector`.

Do not put 1688 usernames, passwords, OTPs, or recovery data in workflow JSON.

## UI/API Operation Policy

Model each platform operation as a WebOps Forge `operation`:

- browser branch: selectors and screenshots for the UI path
- API branch: HTTP request for a stable platform endpoint when one is available
- run context: `context.operationModes.<operationId>` decides which branch executes

Example:

```json
{
  "context": {
    "operationModes": {
      "keywordSearch": "api",
      "detailCapture": "browser"
    }
  }
}
```

If an API endpoint relies on the logged-in browser session, set the API branch to use browser session cookies in the private workflow:

```json
{
  "id": "keywordSearch",
  "action": "operation",
  "mode": "{{context.operationModes.keywordSearch}}",
  "api": {
    "method": "GET",
    "url": "https://example.1688.test/search",
    "session": "browser",
    "extract": "json.data"
  }
}
```

Keep all platform endpoint details in the private adapter, not in this open-source package.

## Workflow Contract

A 1688 keyword workflow should accept:

```json
{
  "input": {
    "query": "透明收纳盒",
    "maxResults": 20
  },
  "context": {
    "accountName": "operator-01",
    "approvals": {}
  }
}
```

It should output:

```json
{
  "searchPageTitle": "...",
  "candidatePayload": "..."
}
```

Detailed parsing can live in the private adapter after extraction. WebOps Forge should not learn supplier scoring or sourcing policy.

## Approval Gates

Use `approval` steps before any commercial action.

Example:

```js
{
  id: "approveMessageSend",
  action: "approval",
  name: "sendSupplierMessage",
  prompt: "Operator approves outbound supplier message."
}
```

The run continues only when `context.approvals.sendSupplierMessage === true` or a policy approves it.

## Evidence

For every real platform run, capture:

- search result page
- product detail page
- blocked state
- message draft before send
- send confirmation after approval

Use artifact retention policies for customer-sensitive screenshots.
