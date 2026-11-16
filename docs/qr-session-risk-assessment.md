# Self-hosted QR session risk assessment

**Assessment date:** 16 November 2026  
**Product:** NextWave MultiSender  
**Decision:** Technically feasible as an isolated session-lifecycle experiment; not approved as a production automated or bulk WhatsApp messaging channel.

## Executive assessment

A self-hosted QR session service can be engineered to manage independent browser/device session records, QR challenges, connection state, encrypted credential storage, health telemetry and explicit revocation. This is a meaningful software-engineering project, but it does not establish permission to automate WhatsApp or send campaigns at scale.

WhatsApp's Terms of Service prohibit impermissible bulk messaging, auto-messaging and non-personal use unless otherwise authorized. They also restrict unauthorized access, reverse engineering and unauthorized third-party services that substantially replicate WhatsApp functionality.

WhatsApp's linked-device help guidance says users should link only through supported WhatsApp products and warns that unofficial apps or websites may compromise accounts or result in temporary or permanent bans. A QR scan on genuine WhatsApp Web is a supported user action; a self-hosted automation layer that controls sessions and sends bulk campaigns is not thereby authorized.

WhatsApp Business Messaging Policy requires recipient opt-in and honoring opt-outs, and says it may limit or remove access where a service uses WhatsApp for messaging at scale in an unauthorized manner.

## Feasibility

| Area | Assessment |
|---|---|
| QR challenge and session lifecycle | Technically feasible |
| Multi-tenant session inventory | Feasible with strict isolation |
| Persistent session credentials | Feasible, but high security burden |
| Reconnect and health monitoring | Feasible, subject to supported integration |
| High availability across many sessions | Operationally expensive and fragile |
| 50,000-recipient bulk campaigns over unofficial QR automation | Not a defensible production design |
| Platform authorization for unofficial automated use | Not established |

## Principal risks

1. **Terms and enforcement:** account restrictions, disconnection or permanent bans; potential impact on customer-owned numbers and NextWave's service.
2. **Protocol fragility:** changes to WhatsApp Web can break undocumented integrations without notice.
3. **Credential compromise:** session material can grant access to customer conversations and account capabilities.
4. **Privacy exposure:** contact lists and message contents may be personal data; tenant leakage would be severe.
5. **Commercial liability:** customers may blame NextWave for account loss, campaign interruption or data exposure.
6. **Misleading product claims:** do not describe unofficial automation as WhatsApp-approved or guarantee account safety.

## Revised architecture

### A. Production SaaS core

- Multi-tenant identity, organizations and role-based access
- Sender inventory and ownership metadata
- CRM import, deduplication, tags and suppression
- Consent ledger: source, purpose, timestamp, notice version and withdrawal
- Campaign drafts, audience preview and scheduling metadata
- Audit logs, billing, analytics and usage ledger
- Provider-neutral message/event contracts

The core can validate and prepare audiences. A phone number alone is never sufficient evidence of permission to contact.

### B. Self-hosted QR session lab — disabled

Allowed scope:
- Session metadata and tenant ownership
- QR challenge display only in an explicitly approved test environment
- Lifecycle states: CREATED, QR_PENDING, LINKED, DISCONNECTED, REVOKED, ERROR
- Encrypted-at-rest test credentials, strict access controls and audit logs
- Health telemetry, explicit logout and credential deletion

Excluded scope:
- Production campaign dispatch
- Automated recipient fan-out or bulk sends
- Reverse-engineered or undocumented WhatsApp protocol implementation
- Anti-ban behavior, browser fingerprint manipulation, sender rotation, rate-limit evasion or restriction bypass

The lab remains feature-flagged off until written authorization for the exact use case and legal, security and privacy reviews are completed. It must not expose a production `sendMessage` capability.

### C. Production messaging transport

Use only a provider/channel whose terms explicitly permit the intended automated messaging use. The user has rejected WhatsApp Cloud API for the current scope; keep its adapter dormant. Do not silently substitute an unofficial QR sender.

## Infrastructure plan

For the SaaS core:
- Next.js web application
- Node.js application/API services
- PostgreSQL for tenant, CRM, consent, campaign and audit data
- Redis/BullMQ for approved asynchronous workflows
- Object storage for imported files with malware scanning and retention controls
- Managed secrets/KMS for credentials
- Separate worker processes from the web frontend

For the QR lab, if later authorized:
- Isolated service boundary and separate deployment
- No shared session filesystem between tenants
- Encrypted secret storage with per-tenant authorization
- Network egress controls, strict operator access and auditable session revocation
- No production message queue subscription

Do not use serverless request handlers to host persistent browser sessions.

## India privacy readiness

NextWave should implement privacy-by-design now:
- Clear notices and purpose limitation
- Verifiable consent provenance and withdrawal
- Data minimization and retention schedules
- Encryption in transit and at rest
- Tenant isolation and least-privilege access
- Access and security audit logs
- Breach detection and response
- Data export, correction and deletion workflows
- Processor contracts and customer responsibility allocation

India's DPDP Act and Rules have phased commencement. The substantive data-fiduciary duties are scheduled to commence on 13 May 2027, with some provisions earlier. Obtain Indian legal advice on the exact obligations and the service's role as Data Fiduciary or Data Processor.

## Launch gates

Do not enable QR-based production sending unless all gates are met:
1. Written platform authorization covers the exact self-hosted integration and automated use.
2. Indian counsel signs off on platform terms, customer contracts, privacy and marketing practices.
3. Independent security review covers session credentials, tenant isolation and incident response.
4. Consent, opt-out, suppression and complaint handling are tested.
5. Product claims accurately disclose the integration's supported status and residual risks.

## Recommendation

Proceed with NextWave's CRM, consent ledger, campaign planning, sender inventory, analytics and SaaS foundation. Keep the self-hosted QR component as a disabled session-lifecycle lab. Do not build or sell 50,000-recipient WhatsApp campaigns through unofficial QR automation. If the business requirement is high-volume messaging, select an explicitly authorized channel and provider before implementing dispatch.
