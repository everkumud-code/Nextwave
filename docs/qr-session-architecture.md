# NextWave QR Session Architecture

## Objective

Provide a self-hosted QR session management layer that can support multiple connector implementations. Connector selection is a deployment/customer configuration; the SaaS core remains provider-neutral.

## Components

1. **Web dashboard** — initiates pairing, displays a short-lived QR challenge, and shows session status.
2. **Core API** — authenticates the operator, resolves tenant and sender ownership, and authorizes lifecycle operations.
3. **Session manager** — coordinates create, refresh, revoke and recovery operations.
4. **Connector adapter** — implements the provider-specific session operations behind `QrSessionProvider`.
5. **Session repository** — stores metadata and encrypted credential references in PostgreSQL.
6. **Secret store** — stores session credentials encrypted, with access controlled by tenant and service identity.
7. **Session worker** — polls or consumes provider events, updates health, and handles reconnect state.

## Session lifecycle

`CREATED → QR_PENDING → PAIRING → CONNECTED`

Other transitions include `RECONNECTING`, `DISCONNECTED`, `REVOKED` and `ERROR`. A provider adapter is responsible for translating its native events into these normalized states.

## Data model

Each session is scoped by:
- `organizationId`
- `senderId`
- `ownership` (CUSTOMER or PLATFORM)
- `providerSessionId`
- `credentialRef` (reference only; never raw credentials)
- lifecycle timestamps and last error details

Use a unique active-session constraint per organization and sender. Enforce tenant scope in every repository query, not only in the UI.

## Security and operations

- QR payloads are short-lived and must not be written to persistent storage or logs.
- Raw session credentials must never reach the browser or application logs.
- Encrypt credentials at rest and rotate encryption keys.
- Require explicit operator authorization for create/revoke actions.
- Audit session creation, pairing, refresh, disconnect and revocation.
- Revoke and delete credential material when a session is removed.
- Isolate session workers and storage by tenant boundaries.
- Add health checks, reconnect backoff, worker heartbeats and operational alerts.
- Use a durable repository; do not use process memory as production session storage.

## Current code status

The repository now includes typed session contracts and a lifecycle manager that delegates provider-specific behavior to an adapter. A production database repository, provider adapter, QR UI, background worker and end-to-end tests are still required. The manager does not itself implement a WhatsApp protocol.
