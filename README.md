# NextWave MultiSender

A multi-tenant messaging operations SaaS with organisation workspaces, sender inventory, contacts, consent records, campaigns and provider-neutral connector adapters.

## Current implementation

- Email/password registration and login
- Seven-day, HTTP-only signed session cookie
- Organisation creation and OWNER membership on registration
- Tenant-scoped sender inventory API
- Sender create, rename and archive operations
- E.164 phone validation, duplicate sender protection and audit events
- PostgreSQL persistence through Prisma

The sender dashboard now reads real database records. New sender records begin in PENDING state. Provider pairing and message dispatch are separate milestones and are not represented as live when they are not connected.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS + Lucide
- PostgreSQL + Prisma
- jose signed sessions + bcryptjs password hashing
- Modular connector contracts and isolated QR session service adapter

## Local development

1. Use Node.js 22 or newer.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Set `DATABASE_URL` to a PostgreSQL database.
5. Generate a strong random `AUTH_SECRET` of at least 32 characters.
6. Run `npm run db:generate`.
7. Run `npm run db:migrate`.
8. Run `npm run dev` and open `http://localhost:3000`.

## Validation

- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Architecture

- `docs/implementation-plan.md`
- `docs/database-architecture.md`
- `docs/connector-architecture.md`
- `docs/qr-session-architecture.md`
- `docs/qr-session-service-api.md`

## Next milestones

1. Sender assignment and provider connection workflows
2. QR session runtime integration and live pairing state
3. Contact import, deduplication and consent management
4. Campaign builder, queue processing and delivery reporting
5. Team invitations, billing and platform administration
