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
- Tenant-scoped contacts, append-only WhatsApp consent records and CSV/XLSX import
- Contact groups with campaign audience integration
- Campaign scheduling, PostgreSQL queue leases, retries and provider receipt reconciliation
- Separate self-hosted QR runtime and persistent queue worker

The sender dashboard now reads real database records. New sender records begin in PENDING state. The QR pairing UI and runtime are implemented as a separate long-running service; deploy the runtime and apply database migrations before connecting real senders.

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

## Deployment

A Render Blueprint is available in `render.yaml` and provisions the web app, PostgreSQL, private QR runtime and persistent queue worker. Review the plans and supply the required secrets before provisioning. See `docs/qr-runtime-deployment.md` for the full deployment and sender-pairing checklist.

## Architecture

- `docs/implementation-plan.md`
- `docs/database-architecture.md`
- `docs/connector-architecture.md`
- `docs/qr-session-architecture.md`
- `docs/qr-session-service-api.md`
- `docs/qr-runtime-deployment.md`

## Next milestones

1. Sender assignment and provider connection workflows
2. QR session runtime integration and live pairing state
3. Contact import, deduplication and consent management
4. Campaign builder, queue processing and delivery reporting
5. Team invitations, billing and platform administration
