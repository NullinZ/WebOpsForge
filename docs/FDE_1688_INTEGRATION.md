# FDE 1688 Integration Boundary

This document describes how a private FDE 1688 adapter should use WebOps Forge.

## Rule

WebOps Forge owns the generic execution layer.

The private 1688 project owns:

- 1688 selectors
- account and profile assignments
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
