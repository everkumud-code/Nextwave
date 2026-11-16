# NextWave MultiSender

A multi-tenant messaging operations SaaS with sender management, contact CRM, consent records, campaign planning, team workflows, billing and provider-neutral connector adapters.

## Current status

**Foundation scaffold committed.** The repository contains a dashboard prototype, sender inventory UI, connector contracts and an implementation roadmap. Displayed account names, message counts, activity and delivery metrics are sample UI data.

No live messaging, QR session creation, authentication, database persistence or billing is enabled.

## Product and integration decision

The current requested direction is a self-hosted QR session architecture. After feasibility and policy review, the QR component is scoped as an isolated, disabled **session lab** only. It is not a production WhatsApp bulk-messaging engine.

WhatsApp's Terms restrict impermissible bulk/automated messaging and unauthorized non-personal use. WhatsApp's linked-device help guidance warns that unofficial apps or websites may compromise accounts or lead to temporary or permanent bans. A QR scan on genuine WhatsApp Web does not authorize an unofficial automated messaging product.

The user has rejected WhatsApp Cloud API for the current scope. Its adapter remains dormant scaffolding, not the default transport. Production messaging requires a provider and integration explicitly authorized for the intended use.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS + Lucide
- PostgreSQL + Prisma (planned)
- Redis + BullMQ (planned for approved asynchronous workflows)
- Provider-neutral connector contract
- Self-hosted QR session-lab boundary (disabled; no message dispatch)

## Local development

1. Install Node.js 22 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and fill only the services you have configured.
4. Run `npm run dev`.
5. Open `http://localhost:3000`.

Validation commands:

- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Architecture and roadmap

- `docs/implementation-plan.md`
- `docs/connector-architecture.md`
- `docs/qr-session-risk-assessment.md`
- `src/lib/connectors/types.ts`

## Safety, privacy and compliance

The platform is designed around authorized channels, purpose-specific consent, opt-out enforcement, tenant isolation, access controls, encryption, auditability, retention and deletion.

It does not implement scraping, undocumented protocol reverse engineering, restriction circumvention, anti-ban techniques, or sender rotation to evade provider controls. The QR lab remains disabled and must not send messages. Do not market it as WhatsApp-approved or promise that accounts are safe from restrictions.
