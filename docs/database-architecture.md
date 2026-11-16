# NextWave database architecture

## Stack

- PostgreSQL as the source of truth
- Prisma ORM and generated TypeScript client
- Organization-scoped records for all customer data
- Redis/BullMQ will be introduced for asynchronous jobs; it is not the source of truth

## Schema domains

- Identity: User, Membership, Organization
- Sender operations: Sender, QrSession
- Audience: Contact, ConsentRecord
- Campaign operations: Campaign, CampaignRecipient, Message
- Governance: AuditLog

## Tenant isolation

Every customer-owned data model includes an `organizationId` directly or is reachable through an organization-owned parent. Every repository/service method must derive the organization ID from the authenticated server-side membership, never trust a client-provided organization ID by itself.

Important application-level invariants:
- A Sender's organization must match the organization used to create its QrSession.
- A Campaign's sender and all campaign contacts must belong to the same organization.
- Consent is evaluated for the specific contact, channel and purpose.
- Message idempotency is unique within an organization.
- Platform-owned senders still have an organization assignment for operational scoping.

## QR session persistence

The database stores session metadata and a reference to encrypted credentials. It must never store the raw credential or short-lived QR pairing payload. The Prisma repository is scoped by organization ID on reads and writes.

## Local setup

1. Create a PostgreSQL database.
2. Copy `.env.example` to `.env.local`.
3. Set `DATABASE_URL`.
4. Run `npm install`.
5. Run `npm run db:generate`.
6. Run `npm run db:migrate`.
7. Run `npm run dev`.

## Next implementation tasks

- Authentication and session issuance
- Organization-scoped API routes
- Sender and contact repositories
- Audit-log service
- Database migration review and integration tests
- Managed secret vault integration
