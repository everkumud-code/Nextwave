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
- [x] Authenticated sender QR session API (start, status refresh, revoke)
- [x] Live QR pairing panel with QR rendering, expiry and connection polling
- [x] Authenticated sender QR session API (start, refresh, status, revoke)
- [x] Live QR pairing panel with QR rendering, expiry and connection polling
- [ ] Deployable QR runtime service with persistent credential storage
- [ ] Runtime reconnect handling, health checks and integration tests
- [ ] Sender status reconciliation worker
- [ ] Campaign queue and dispatch adapter using configured connector capabilities

## Milestone 4 — CRM and campaign planning
- [ ] Contact import, mapping, deduplication and validation
- [ ] Consent ledger: source, purpose, timestamp, notice version and withdrawal
- [ ] Suppression and opt-out enforcement
- [ ] Campaign builder, audience preview and scheduling metadata
- [ ] Queue and idempotency for approved transports only
- [ ] Retry and dead-letter handling without bypassing provider restrictions

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
