# QR Session Service API Contract

The web application talks to a separately deployed self-hosted session service. This contract allows the session runtime to evolve independently from NextWave's SaaS API.

## Authentication

Every request uses a server-to-server bearer token:

`Authorization: Bearer <QR_SESSION_SERVICE_TOKEN>`

The token is stored only in server environment variables. The QR service must validate it before processing any request. Use TLS outside local development.

## Create session

`POST /v1/sessions`

Request:
```json
{
  "organizationId": "org_id",
  "senderId": "sender_id",
  "ownership": "CUSTOMER"
}
```

Response:
```json
{
  "sessionId": "runtime_session_id",
  "qrPayload": "short-lived-pairing-payload",
  "expiresAt": "2026-11-16T12:05:00.000Z"
}
```

The QR payload is transient. The web app returns it only to the initiating authorized operator and does not persist it in PostgreSQL.

## Read session state

`GET /v1/sessions/{sessionId}`

Response:
```json
{
  "status": "QR_PENDING",
  "qrPayload": "short-lived-pairing-payload",
  "expiresAt": "2026-11-16T12:05:00.000Z",
  "connectedAt": null,
  "lastSeenAt": null,
  "credentialRef": null,
  "errorCode": null,
  "errorMessage": null
}
```

Allowed status values:
`CREATED`, `QR_PENDING`, `PAIRING`, `CONNECTED`, `RECONNECTING`, `DISCONNECTED`, `REVOKED`, `ERROR`.

The service returns the current QR payload and expiry only while pairing is pending. It returns a credential reference, never raw session credentials.

## Revoke session

`DELETE /v1/sessions/{sessionId}`

Success response: HTTP `204 No Content`.

Revocation must terminate the runtime session and invalidate or delete its credential material.

## Error responses

Use standard HTTP status codes. Return a machine-readable JSON error with a stable code, but never include credentials, QR payloads, cookies, browser storage or other secret material in error messages.

## Operational requirements

- Enforce tenant ownership for every session.
- Treat `organizationId` and `senderId` from the application as identifiers to validate, not as authorization on their own.
- Do not log authorization headers or pairing payloads.
- Apply request timeouts and bounded response sizes.
- Make create and revoke operations idempotent where possible.
- Publish accurate lifecycle states and timestamps.
- Provide health and readiness endpoints for orchestration.
