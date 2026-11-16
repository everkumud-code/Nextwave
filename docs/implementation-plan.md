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
- [x] Campaign queue and dispatch adapter using configured connector capabilities

## Milestone 4 — CRM and campaign planning
- [x] Tenant-scoped contact list and manual contact creation API
- [x] Indian mobile and international E.164 normalization with workspace duplicate protection
- [x] Contact Manager UI with search and status visibility
- [x] Append-only consent event API with source, purpose, timestamp, notice version, evidence reference and withdrawal
- [x] Contact consent controls with audit events and unsubscribe/re-consent state updates
- [x] CSV import with header aliases, quoted-field parsing, 5,000-row validation and preview
- [x] Tenant-scoped duplicate detection, row-level errors, explicit consent import and per-contact audit events
- [x] XLSX contact import for first worksheet with shared/inline string parsing, duplicate validation and explicit consent handling
- [ ] Configurable import field mapping
- [x] Consent-aware campaign audience selection using latest WhatsApp marketing consent state
- [x] Campaign draft creation with tenant-scoped sender assignment and recipient snapshot
- [x] Campaign Manager UI with audience/suppression metrics and draft inventory
- [x] Campaign draft editor with editable recipient selection and connected sender assignment
- [x] Campaign scheduling metadata and explicit schedule action with future-time validation
- [x] Due-campaign scheduler with transactional queue promotion and execution-time consent/sender revalidation
- [x] Message content editor, supported contact variables and personalisation preview
- [x] Server-side draft readiness validation for sender, message, audience and current consent state
- [x] Transactional campaign queue operation with current consent revalidation and idempotent per-recipient message creation
- [x] Persistent PostgreSQL queue claiming using row locks and SKIP LOCKED leases
- [x] Bounded exponential retry policy, lease recovery and per-message attempt limits
- [x] Connector-aware dispatch orchestration with sender and latest-consent revalidation
- [x] Gated standalone queue worker runner and batch polling configuration
- [x] Provider error retry classification and lease-token guarded state updates
- [x] QR connector adapter wired to the self-hosted Baileys runtime send endpoint
- [x] Runtime validates persisted queue job, tenant, sender, lease token and payload before sending
- [ ] Deploy QR runtime and worker, then verify end-to-end provider delivery
- [x] Baileys sent, delivered and read receipt reconciliation into message status
- [x] Campaign completion aggregation after all jobs reach terminal delivery/failure states
- [x] Meta webhook verification challenge and HMAC-SHA256 signature validation
- [x] Durable Meta delivery receipt persistence and monotonic message status reconciliation (including early receipt replay after provider ID persistence)
- [ ] Campaign approval workflow
- [x] Durable queue records and organization-scoped idempotency keys
- [x] Pure QR delivery receipt ordering and terminal-state transition tests
- [x] Queue lease, idempotency and scheduled-dispatch integration tests against PostgreSQL
- [x] Bounded retry and terminal failure handling with provider-aware failure classification

## Milestone 5 — SaaS operations
- [ ] Team inbox only for supported, authorized channels
- [x] Workspace team invitations with single-use expiring links and role-based membership
- [x] Workspace analytics overview with CRM/sender/campaign totals, message outcomes and 14-day trend
- [x] Tenant-scoped contact and filtered message CSV exports with per-message charge, status and provider receipt timestamps
- [x] Prepaid wallet, admin-controlled per-message pricing, immutable credit ledger and atomic campaign queue charging
- [ ] Plans, subscriptions, invoices and payment gateway integration
- [x] Platform-admin client credit allocation and pricing console with audit events
- [ ] Full Super Admin operations, client lifecycle controls and audit log viewer
- [ ] Retention, deletion and incident-response workflows

## Engineering controls
- Never mark a sender CONNECTED unless the runtime confirms the connection.
- Keep pairing payloads transient and credentials outside the browser.
- Enforce organization ownership on every session operation.
- Persist runtime state and recover sessions after process restarts.
- Stop reconnect attempts when the runtime reports a terminal or unhealthy state.
