# Implementation plan

## Product decision

NextWave will use a provider-neutral SaaS core. The requested self-hosted QR approach is restricted to an isolated, disabled session lab. It is not a production WhatsApp bulk-messaging transport unless written platform authorization is obtained for the exact use case.

The user has rejected WhatsApp Cloud API for the current scope. Keep its scaffold dormant; do not make it the default or silently substitute it.

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
- [ ] Self-hosted QR runtime implementation and integration tests
- [ ] Feature flag and server-side enforcement that keeps QR lab disabled
- [ ] No QR-based campaign dispatch
- [ ] Approved production connector only after provider/legal/security approval

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

## Guardrails
- Support only authorized accounts and consent-based communications.
- QR pairing with genuine WhatsApp Web does not authorize unofficial automation.
- No undocumented protocol reverse engineering, scraping, anti-ban techniques, account rotation to evade controls, or restriction circumvention.
- Do not expose production sending from the QR session lab.
- Stop workflows when a provider reports restrictions or an account is unhealthy.
- Do not claim WhatsApp approval, guaranteed delivery or account safety without evidence.
