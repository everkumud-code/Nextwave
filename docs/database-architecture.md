# NextWave database architecture

## Stack

- PostgreSQL as the source of truth
- Prisma ORM and generated TypeScript client
- Organization-scoped records for all customer data
- Redis/BullMQ will be introduced for asynchronous jobs; it is not the source of truth

## Schema domains

- Identity: User, Membership, Organization
- Sender operations: Sender, QrSession
- Audience: Contact, ConsentRecord, ContactGroup, ContactGroupMember
- Campaign operations: Campaign, CampaignRecipient, Message
- Governance: AuditLog

## Tenant isolation

Every customer-owned data model includes an `organizationId` directly or is reachable through an organization-owned parent. Contact groups are organization-scoped, and membership is only writable after validating that every selected contact belongs to the authenticated organization. Every repository/service method must derive the organization ID from the authenticated server-side membership, never trust a client-provided organization ID by itself.

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


## QR runtime credentials

- `QrCredential` stores the encrypted Baileys authentication credential object per runtime session.
- `QrSignalKey` stores each Signal Protocol key separately, encrypted at rest with AES-256-GCM.
- The encryption key is supplied only to the QR runtime through `QR_CREDENTIAL_ENCRYPTION_KEY`.
- Pairing QR payloads are transient and are not persisted.
- Deleting a credential cascades to its Signal key records; deleting a sender or organization also removes associated credentials.


## Contact import and groups

- CSV import accepts up to 5,000 rows and 2 MB.
- XLSX import reads the first worksheet, shared strings and inline strings, up to 5,000 rows and 5 MB. Archive expansion is bounded during parsing.
- Both formats share phone normalization, duplicate detection, row-level validation and explicit affirmative WhatsApp consent capture.
- Imported contacts record their source as `CSV_IMPORT` or `XLSX_IMPORT`.
- Contact groups are tenant-scoped. Membership is unique per group/contact pair, and deleting a group never deletes its contacts.
- Campaign recipient selection can add members from a saved group, then filters to contacts currently present in the eligible audience.
