# Logger Client API

The canonical logger API contract lives in
[`servers/logger/API.md`](../servers/logger/API.md). Keep endpoint and schema
changes there first; this document only describes how the DTaaS client uses
that contract.

## Overview

The DTaaS client can stream workflow interaction events to a backend logger.
Events are sent as fire-and-forget requests, so logging should never block user
navigation or UI interaction.

## Client configuration

Set `LOGGER_URL` to the logger endpoint, including the `/logger` route prefix:

```javascript
window.env = {
  // ... other config
  LOGGER_URL: 'https://your-server.com/logger',
};
```

The `/logger` suffix matters. The client validates reachability by appending
`/health`, so `https://your-server.com/logger` checks
`https://your-server.com/logger/health`.

For non-Docker local development, where the client runs on port `4000` and the
logger runs directly on port `4003`, use:

```javascript
window.env = {
  // ... other config
  LOGGER_URL: 'http://localhost:4003/logger',
};
```

For Docker development behind Traefik, `http://localhost/logger` is correct.

Logging is disabled by default and can be enabled from account settings. When
`LOGGER_URL` is empty or undefined, enabled logging stores events locally in
IndexedDB without backend streaming.

## Transport

The client uses the
[Beacon API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon)
(`navigator.sendBeacon`):

- Events are sent with HTTP `POST`.
- The request `Content-Type` is `text/plain;charset=UTF-8`.
- The body is still JSON-encoded text.
- The client does not read response bodies or status codes.
- Payloads are sent one event at a time, not batched.

Because Beacon requests cannot set custom headers, the bundled browser client
cannot use the logger service's optional bearer-token mode. Browser ingest
security is expected to come from the deployment reverse proxy.

## Event payload

The client sends the log-event shape documented in the canonical server
contract. A typical event looks like:

```json
{
  "sessionId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "userHash": "a3f2b8c1d4e5f67890abcdef1234567890abcdef1234567890abcdef12345678",
  "timestamp": "2026-03-24T20:00:00.000Z",
  "event": "click",
  "page": "/preview/digitaltwins",
  "element": "button",
  "label": "Start",
  "context": {
    "dt": {
      "name": "WaterTank",
      "button": "start",
      "history": ["2026-03-24T19:00:00.000Z"]
    }
  }
}
```

Valid event names, field requirements, context limits, and server responses are
defined in [`servers/logger/API.md`](../servers/logger/API.md).

## Privacy

- Usernames are hashed client-side with SHA-256 before transmission. This is
  pseudonymization, not anonymization: the same username produces the same hash.
- Session IDs are random UUID v4 values.
- The client does not add cookies or IP-based tracking fields to log events.

## Backend compatibility

The bundled logger microservice is the supported backend. For experiments or
local testing, any HTTP service that accepts JSON text posts can be used if it
matches the canonical contract.

Minimal Express-compatible example:

```javascript
import express from 'express';
import { appendFileSync } from 'fs';

const app = express();
app.use(express.json({ type: ['application/json', 'text/plain'] }));

app.post('/logger', (req, res) => {
  appendFileSync('workflow-logs.jsonl', `${JSON.stringify(req.body)}\n`);
  res.sendStatus(204);
});

app.get('/logger/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(4003);
```
