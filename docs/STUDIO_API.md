# Studio API

The Studio API is local-first and intended for developer/operator tooling.

## Runtime

### `GET /api/health`

Returns service health.

### `GET /api/runtime`

Returns queue state, data directory, and supported modes.

## Workflows

### `GET /api/workflows`

Lists workflow records.

### `POST /api/workflows`

Creates a workflow record.

### `GET /api/workflows/:id`

Fetches one workflow record.

### `PUT /api/workflows/:id`

Updates one workflow record.

### `DELETE /api/workflows/:id`

Deletes one workflow record.

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

### `GET /api/runs/:id/events`

Fetches event timeline records.

### `GET /api/runs/:id/artifacts/:name`

Downloads a run artifact.
