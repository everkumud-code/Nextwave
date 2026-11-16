# NextWave MultiSender

A multi-tenant messaging operations SaaS with a unified sender manager, contact CRM, campaign orchestration, team inbox, billing and connector adapters.

## Current status

**Milestone 1 foundation scaffold committed.** The repository currently contains a responsive dashboard prototype, sender inventory UI, add-sender form, connector contracts and an implementation roadmap.

The displayed account names, message counts, activity and delivery metrics are sample UI data. No live WhatsApp messages are sent by this scaffold.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS + Lucide
- PostgreSQL + Prisma (next milestone)
- Redis + BullMQ (next milestone)
- Official WhatsApp Cloud API adapter scaffold
- Experimental QR provider adapter boundary (disabled by default)

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
- `src/lib/connectors/types.ts`

## Safety and compliance

The platform is designed for authorised accounts and consent-based communications. It does not implement scraping, undocumented protocol reverse engineering, restriction circumvention, anti-ban techniques, or account rotation to evade provider controls.

The official and experimental connector adapters are scaffolds only. Live message delivery, QR session creation, database persistence, authentication and billing are not enabled yet. The experimental QR connector is disabled by default and may only be connected to a reviewed, authorised provider.
