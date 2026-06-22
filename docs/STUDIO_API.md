# Studio API

The Studio API is local-first and intended for developer/operator tooling.

## Runtime

### `GET /api/health`

Returns service health.

### `GET /api/runtime`

Returns queue state, data directory, supported run modes, and supported operation branch modes.

### `GET /api/audit`

Returns recent audit records.

### `GET /api/export`

Exports the registry, workflows, profiles, and recent run metadata.

### `POST /api/import`

Imports the registry, workflows, and profiles from an exported bundle.

## Browser Picker

### `GET /api/picker/session`

Returns the active picker session, or `null` when Studio is not waiting for a target element.

The Chrome extension uses this endpoint to decide whether a picker session exists. While a session exists, the extension side panel is available on regular `http` and `https` pages; `targetUrl` and `allowedUrls` are references for Studio, not a tab-level visibility gate.

### `POST /api/picker/session`

Creates or replaces the active picker session.

Request:

```json
{
  "workflowId": "sample-dry-run-search",
  "workflowName": "Search operation",
  "nodeId": "fillSearch",
  "nodeLabel": "Fill search",
  "targetUrl": "https://www.douyin.com/",
  "allowedUrls": ["https://www.douyin.com/"],
  "startedAt": "2026-06-22T05:20:00.000Z"
}
```

### `DELETE /api/picker/session`

Clears the active picker session. Studio and the bundled extension call this after a pick is posted or when no target URL can be inferred.

### `GET /api/picker/events`

Returns recent Chrome picker events.

Query:

- `limit`: maximum events to return. Default: `20`.

### `POST /api/picker/events`

Receives a Chrome-side element pick and normalizes it into a Studio picker event.

Request:

```json
{
  "source": "webops-forge-picker-extension",
  "field": "inputTarget",
  "url": "https://www.douyin.com/",
  "title": "抖音",
  "suggestedAction": "fill",
  "recommendedSelector": "input[data-e2e=\"searchbar-input\"]",
  "selectorCandidates": [
    {
      "selector": "input[data-e2e=\"searchbar-input\"]",
      "source": "attribute:data-e2e",
      "score": 104,
      "matchCount": 1,
      "visibleCount": 1,
      "unique": true,
      "stable": true
    }
  ],
  "target": {
    "tagName": "input",
    "attributes": {
      "data-e2e": "searchbar-input",
      "placeholder": "搜索"
    },
    "classList": ["search-input"],
    "text": "",
    "labelText": "",
    "accessibleName": "搜索"
  }
}
```

Response:

```json
{
  "event": {
    "id": "picker_...",
    "recommendedSelector": "input[data-e2e=\"searchbar-input\"]",
    "confidence": 100,
    "targetIdentity": {
      "version": 1,
      "tagName": "input",
      "attributes": {
        "data-e2e": "searchbar-input",
        "placeholder": "搜索"
      }
    }
  }
}
```

Studio stores picker events in `.webops-forge/picker-events.json` and the active picker session in `.webops-forge/picker-session.json`. Applying an event to a workflow node writes `selector`, `selectorCandidates`, `pickedFrom`, and `targetIdentity`. Playwright runs use `targetIdentity` to score candidate elements before acting. The bundled Chrome extension lives in `apps/picker-extension`.

## Registry

The registry is the generic authoring model behind the Studio UI:

- `sites`: platform or tenant-level targets.
- `pages`: page patterns under a site.
- `actions`: reusable browser/API page actions.
- `operations`: business-level capabilities that compose actions and can become workflows.

### `GET /api/registry`

Fetches the full registry.

### `PUT /api/registry`

Replaces the full registry.

### `POST /api/registry/:section`

Creates or upserts one registry item in `sites`, `pages`, `actions`, or `operations`.

### `PUT /api/registry/:section/:id`

Updates one registry item.

### `DELETE /api/registry/:section/:id`

Deletes one registry item.

## Workflows

### `GET /api/workflows`

Lists workflow records.

### `POST /api/workflows/validate`

Validates a workflow definition.

### `POST /api/workflows`

Creates a workflow record.

### `GET /api/workflows/:id`

Fetches one workflow record.

### `PUT /api/workflows/:id`

Updates one workflow record.

### `DELETE /api/workflows/:id`

Deletes one workflow record.

## Profiles

Profiles represent local dry-run fixtures or browser/account execution targets. A browser profile should map to one persistent logged-in account directory.

### `GET /api/profiles`

Lists profiles.

### `POST /api/profiles`

Creates a profile.

### `GET /api/profiles/:id`

Fetches one profile.

### `PUT /api/profiles/:id`

Updates one profile.

### `POST /api/profiles/:id/check-session`

Checks a profile's login state and writes the result back to the profile.

Request:

```json
{
  "platform": "1688",
  "url": "https://work.1688.example",
  "accountSelector": ".account-name",
  "loggedOutSelector": ".login-button",
  "timeoutMs": 10000
}
```

Response:

```json
{
  "profile": {
    "id": "operator-01",
    "accountLabel": "operator@example",
    "loginState": "authenticated",
    "lastCheckedAt": "2026-06-17T00:00:00.000Z"
  },
  "result": {
    "loginState": "authenticated",
    "accountLabel": "operator@example"
  }
}
```

For Playwright profiles, `profileDir` must point to the persistent browser profile directory that already contains the logged-in session.

### `DELETE /api/profiles/:id`

Deletes one profile.

## Runs

### `POST /api/workflows/:id/runs`

Queues a workflow run.

Request:

```json
{
  "mode": "dry-run",
  "profileId": "dry-run-demo",
  "input": {},
  "context": {
    "operationModes": {
      "searchSuppliers": "browser"
    }
  },
  "driverConfig": {
    "humanTiming": {
      "enabled": true,
      "minDelayMs": 1000,
      "maxDelayMs": 2400,
      "maxPerMinute": 20
    }
  }
}
```

`humanTiming` adds a random delay before every workflow node. Playwright runs enable it by default from the selected profile's `rateLimit` values; dry-run runs stay immediate unless `humanTiming.enabled` is set.

### `GET /api/runs`

Lists recent runs.

### `GET /api/runs/:id`

Fetches a run with events and artifacts.

### `POST /api/runs/:id/cancel`

Cancels a queued run or requests cancellation for a running run.

### `POST /api/runs/:id/retry`

Creates and queues a retry run using the original run configuration.

### `GET /api/runs/:id/events`

Fetches event timeline records.

### `GET /api/runs/:id/artifacts/:name`

Downloads a run artifact.
