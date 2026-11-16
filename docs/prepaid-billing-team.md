# Prepaid credits, team access and exports

## Prepaid wallet
- Every organization has one permanent credit account.
- Monetary values are stored as integer paise to avoid floating-point billing errors.
- Default message price is 10 paise and can be changed by a platform admin per client.
- Admin top-ups are immutable CREDIT ledger entries; campaign queueing writes a DEBIT entry.
- The per-message price is snapshotted on each queued Message row and included in message CSV exports.
- Campaign queueing checks the available balance and charges the estimated new recipient count in the same serializable database transaction. A campaign cannot be queued when the wallet is short.
- Existing workspace IDs and slugs are not regenerated when credits are added.

## Admin controls
- `GET /api/admin/credits` lists client workspaces and wallet settings; platform-admin access is required.
- `POST /api/admin/credits` adds prepaid paise and/or updates the per-message paise rate.
- Every admin operation is written to the organization audit log.
- The UI is available at `/admin/credits`.

## Client controls
- `GET /api/credits` returns the current wallet and recent ledger entries.
- `PATCH /api/credits/settings` stores a preferred interval from 10 to 90 seconds; default is 60 seconds.
- The selected interval is a preference only until a supported, authorized provider connector enforces its own documented throughput limits. It does not rotate automatically and is not a mechanism to bypass provider limits.

## Team
- Workspace owners/admins can create role-scoped invitations.
- Invitation tokens are random, stored only as SHA-256 hashes, single-use, and expire after seven days.
- Accepted invitations create or attach a user membership; OWNER cannot be granted through an invitation.
- Team invitation creation and acceptance are audited.

## Exports
- `/api/contacts/export` downloads tenant-scoped contact CSV.
- `/api/reports/messages/export` supports date, status and campaign filters and includes message status timestamps, provider IDs, error fields and snapshotted per-message charge.
- Both exports are capped at the latest 50,000 matching rows.

## Messaging and compliance boundary
- Sending is not unlimited. Delivery must follow the connected provider's approved throughput, opt-in/consent, template and quality requirements.
- Automatic interval rotation intended to evade platform detection or enforcement is not implemented.
- Meta Cloud API outbound sending still requires a configured and enabled authorized adapter; webhook receipt ingestion alone does not enable outbound sending.
