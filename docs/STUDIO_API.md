# Studio API

The Studio API is local-first and intended for developer/operator tooling.

## Runtime

### `GET /api/health`

Returns service health.

### `GET /api/runtime`

Returns queue state, data directory, and supported modes.

### `GET /api/audit`

Returns recent audit records.

### `GET /api/export`

Exports workflows, profiles, and recent run metadata.

### `POST /api/import`

Imports workflows and profiles from an exported bundle.

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

Profiles represent local dry-run fixtures or browser/account execution targets.

### `GET /api/profiles`

Lists profiles.

### `POST /api/profiles`

Creates a profile.

### `GET /api/profiles/:id`

Fetches one profile.

### `PUT /api/profiles/:id`

Updates one profile.

### `DELETE /api/profiles/:id`

Deletes one profile.

## Runs

### `POST /api/workflows/:id/runs`

Queues a workflow run.

Request:

```json
{
  "mode": "dry-run",
  "input": {},
  "context": {},
  "driverConfig": {}
}
```

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
