# Implementation plan

## Milestone 1 — Foundation
- [x] Initialise repository and application scaffold
- [ ] Complete responsive dashboard shell
- [ ] Add typed domain models and mock repository

## Milestone 2 — Identity and tenancy
- [ ] Authentication and organisation membership
- [ ] Role-based access control
- [ ] Tenant isolation tests

## Milestone 3 — Sender management
- [ ] Sender inventory and ownership model
- [ ] Connector registry and capability discovery
- [ ] Official WhatsApp Cloud API adapter
- [ ] Experimental QR provider adapter contract, disabled by default

## Milestone 4 — Campaign operations
- [ ] Contact import and consent records
- [ ] Template and campaign builder
- [ ] Queue, idempotency, retry and webhook reconciliation

## Milestone 5 — SaaS operations
- [ ] Team inbox and reports
- [ ] Plans, subscriptions and usage ledger
- [ ] Super Admin and audit logs

## Guardrails
- Support authorised accounts and consent-based messaging only.
- No scraping, undocumented protocol reverse engineering, restriction circumvention, anti-ban techniques or sender rotation to evade provider controls.
- Stop sending when a provider reports restrictions or an account is unhealthy.
