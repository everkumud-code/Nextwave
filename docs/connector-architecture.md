# Connector architecture

NextWave is provider-neutral. CRM, campaign planning, consent, billing and analytics must not depend on a particular messaging transport.

## Product decision: self-hosted QR session lab

The requested self-hosted QR approach is technically possible as a session-management experiment, but it is **not approved for production automated or bulk WhatsApp messaging**.

WhatsApp's Terms prohibit impermissible bulk/automated messaging and unauthorized non-personal use. WhatsApp's linked-device guidance warns that unofficial apps or websites may compromise accounts or lead to temporary or permanent bans. A QR scan on the genuine WhatsApp Web product does not grant permission to build an unofficial automated messaging service around it.

Therefore:

- The self-hosted QR component is an isolated **session lab**, not a campaign transport.
- QR sessions must not expose a production `sendMessage` capability.
- No undocumented protocol reverse engineering, browser fingerprint manipulation, anti-ban logic, sender rotation, rate-limit evasion, or restriction bypass.
- Do not promise account safety or describe this integration as WhatsApp-approved.
- Do not enable the lab for customer production accounts without written authorization covering the intended integration and use.
- If a session is restricted, disconnected, or flagged, stop the relevant workflow and require human review. Never switch accounts to continue the same restricted campaign.

## Architecture boundaries

### 1. SaaS core (production)

- Tenant and role management
- Sender inventory and ownership records
- Contact CRM, imports, deduplication and suppression
- Consent ledger with source, timestamp, purpose, notice version and withdrawal
- Campaign drafts, scheduling metadata and audience previews
- Audit logs, billing and analytics
- Provider-neutral message and event schemas

The SaaS core can prepare campaigns and calculate audience eligibility. It cannot assume that a contact is sendable merely because a phone number exists.

### 2. Self-hosted QR session lab (isolated, disabled)

Permitted engineering scope:

- Session inventory and ownership metadata
- QR challenge display for an explicitly approved test environment
- Session lifecycle states: CREATED, QR_PENDING, LINKED, DISCONNECTED, REVOKED, ERROR
- Encrypted-at-rest storage for any authorized test credentials
- Session health telemetry, audit records and explicit logout/revocation
- Per-tenant isolation and operator access controls

Non-goals:

- No production bulk campaign dispatch
- No automated WhatsApp message sending or recipient fan-out
- No reverse-engineered or undocumented WhatsApp protocol implementation
- No evasion of platform restrictions or account enforcement

A future implementation must first pass legal review, security review, data-protection review and written platform authorization for the exact use case. Until then, the lab remains feature-flagged off.

### 3. Approved messaging connectors

A separate connector may provide production delivery only where the provider's terms and authorization explicitly permit the intended use. The user has currently rejected WhatsApp Cloud API, so it is not part of the active product scope. Keep the connector interface neutral; do not silently enable Meta Cloud API or substitute an unofficial QR sender.

## Production controls

1. Resolve sender and organization ownership server-side.
2. Verify consent purpose, evidence and suppression status before any permitted send.
3. Enforce channel-specific policy and provider limits.
4. Use idempotency keys for permitted message submissions.
5. Store credentials in an encrypted secrets vault, never browser storage.
6. Verify provider webhooks and deduplicate event IDs.
7. Distinguish accepted, sent, delivered, read and failed states only when the transport supplies reliable evidence.
8. Pause workflows when a provider reports a restriction or unhealthy connection.
9. Provide immediate opt-out and suppression propagation across campaigns.
10. Maintain tenant isolation, least-privilege access, auditability, retention and deletion controls.

## Current implementation status

The QR runtime, encrypted session persistence, queue worker and receipt processing are implemented in code. They remain a separately deployed service and are not considered production-ready until legal/security review, provider authorization for the exact use case, deployment and live end-to-end verification are complete. The Meta Cloud API sending adapter remains disabled. A signed webhook endpoint is available for delivery-event reconciliation when a sender has been provisioned through an approved Meta integration.


## Meta webhook event ingestion

- Configure `META_APP_SECRET` and `META_WEBHOOK_VERIFY_TOKEN` as server-side secrets.
- Configure the Meta webhook callback URL as `/api/webhooks/meta` and subscribe to message status events only after an approved Meta app and sender integration exist.
- GET challenge verification uses constant-time token comparison; POST payloads require a valid `X-Hub-Signature-256` HMAC.
- Events are persisted before application. Pending events are replayed when the provider message ID is stored, avoiding the early-webhook race.
- Status progression is monotonic; duplicate and late lower-rank events do not regress terminal delivery state.
- Inbound message payloads are not stored by this status-only handler.
