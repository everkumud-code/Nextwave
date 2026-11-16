# NextWave MultiSender

A multi-tenant messaging operations SaaS with a unified sender manager, contact CRM, campaign orchestration, team inbox, billing and connector adapters.

## Architecture

- Next.js App Router + TypeScript
- Tailwind CSS
- PostgreSQL + Prisma (planned)
- Redis + BullMQ (planned)
- Official WhatsApp Cloud API adapter
- Experimental QR connector interface (disabled by default; provider integration only)

## Safety and compliance

The platform is designed for authorised accounts and consent-based communications. It does not implement scraping, undocumented protocol reverse engineering, restriction circumvention, anti-ban techniques, or account rotation to evade provider controls.

## Development

The initial repository scaffold is being built in milestones. See `docs/implementation-plan.md` for the roadmap.
