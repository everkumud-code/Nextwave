# Implementation plan

## Product direction

NextWave uses a provider-neutral SaaS core. The self-hosted QR session connector is being integrated as a separately deployed runtime behind a server-to-server API. Additional connectors can be enabled independently; the product does not assume one transport for every customer.

## Milestone 1 — Foundation
- [x] Initialise repository and application scaffold
- [x] Complete responsive authentication and sender dashboard shell
- [x] Add PostgreSQL Prisma schema and client foundation
- [x] Add tenant-scoped QR session repository
- [ ] Add typed domain models and mock repository

## Milestone 2 — Identity and tenancy
- [x] Email/password authentication and organisation membership
- [x] Role-based sender management permissions (OWNER / ADMIN / MANAGER)
- [ ] Tenant isolation integration tests
- [x] Sender create/update/archive audit events
- [ ] Production secrets management and audit events for remaining modules

## Milestone 3 — Sender management
- [x] Tenant-scoped sender inventory and ownership model
- [x] Connector registry and capability discovery contracts
- [x] Self-hosted QR session lifecycle contracts and manager
- [x] PostgreSQL-backed QR session repository
- [x] Internal QR session service HTTP adapter and API contract
- [x] Authenticated sender QR session API (start, refresh, status, revoke)
- [x] Live QR pairing panel with QR rendering, expiry and connection polling
- [x] Deployable QR runtime service with AES-256-GCM encrypted credential and Signal-key storage
- [x] Bounded reconnect handling and liveness/readiness endpoints
- [ ] Runtime integration tests
- [x] Sender status reconciliation from runtime lifecycle events
- [ ] Campaign queue and dispatch adapter using configured connector capabilities

## Milestone 4 — CRM and campaign planning
- [x] Tenant-scoped contact list and manual contact creation API
- [x] Indian mobile and international E.164 normalization with workspace duplicate protection
- [x] Contact Manager UI with search and status visibility
- [x] Append-only consent event API with source, purpose, timestamp, notice version, evidence reference and withdrawal
- [x] Contact consent controls with audit events and unsubscribe/re-consent state updates
- [x] CSV import with header aliases, quoted-field parsing, 5,000-row validation and preview
- [x] Tenant-scoped duplicate detection, row-level errors, explicit consent import and per-contact audit events
- [ ] XLSX import and configurable field mapping
- [x] Consent-aware campaign audience selection using latest WhatsApp marketing consent state
- [x] Campaign draft creation with tenant-scoped sender assignment and recipient snapshot
- [x] Campaign Manager UI with audience/suppression metrics and draft inventory
- [x] Campaign draft editor with editable recipient selection and connected sender assignment
- [x] Campaign scheduling metadata with future-time validation (planning only; no dispatch)
- [x] Message content editor, supported contact variables and personalisation preview
- [x] Server-side draft readiness validation for sender, message, audience and current consent state
- [ ] Campaign approval, final validation and scheduling/dispatch transition
- [ ] Queue and idempotency for configured connector capabilities
- [ ] Retry and dead-letter handling with provider-aware failure handling

## Milestone 5 — SaaS operations
- [ ] Team inbox only for supported, authorized channels
- [ ] Reports and usage ledger
- [ ] Plans, subscriptions and billing
- [ ] Super Admin and audit logs
- [ ] Retention, deletion and incident-response workflows

## Engineering controls
- Never mark a sender CONNECTED unless the runtime confirms the connection.
- Keep pairing payloads transient and credentials outside the browser.
- Enforce organization ownership on every session operation.
- Persist runtime state and recover sessions after process restarts.
- Stop reconnect attempts when the runtime reports a terminal or unhealthy state.
