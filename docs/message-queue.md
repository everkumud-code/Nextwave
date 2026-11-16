# Message queue architecture

## Current implementation

Campaign queueing is a tenant-scoped transaction exposed by
`POST /api/campaigns/{campaignId}/queue`.

Before creating jobs, the operation verifies:
- the campaign is still a draft;
- a connected, non-archived sender belongs to the active workspace;
- the message body exists and uses supported contact variables;
- for immediate queueing, the planned send time is not in the future;
- the selected audience is within the 5,000-recipient limit;
- every selected contact is active and its latest WhatsApp marketing consent is granted.

The transaction creates one `Message` row per recipient and moves the campaign
to `QUEUED`. Idempotency keys are deterministic per campaign/contact pair:
`campaign:{campaignId}:contact:{contactId}`. A database unique constraint
prevents duplicate job creation on retries. Delivery semantics are at-least-once: the stable key and stored provider reference suppress normal retries after an accepted send, but a process crash in the narrow interval between provider acceptance and persistence cannot guarantee exactly-once delivery.

## Worker primitives

`src/lib/queue/worker.ts` provides:
- atomic batch claiming with PostgreSQL `FOR UPDATE SKIP LOCKED`;
- a per-claim lease token and five-minute stale-lease recovery;
- attempt counting and per-message maximum attempts;
- conditional submit/retry updates that require the current lease token.

`src/lib/queue/retry-policy.ts` implements bounded exponential backoff,
starting at 30 seconds and capped at one hour by default. Non-retryable
failures can be marked terminal immediately.

## Status reporting

`GET /api/campaigns/{campaignId}/messages` returns tenant-scoped aggregate
counts and a paginated recent message list.

## Scheduled campaign execution\n\nCampaigns can be explicitly armed through `POST /api/campaigns/{campaignId}/schedule`. Scheduling requires a future `scheduledAt`, a connected workspace sender, a non-empty supported message, and a currently eligible consented audience. The campaign transitions from `DRAFT` to `SCHEDULED` only after these checks pass.\n\nThe standalone queue worker runs `processDueScheduledCampaigns` before dispatching jobs. It scans due campaigns, revalidates sender ownership/status and the latest contact consent at execution time, then atomically changes the campaign to `QUEUED` and creates idempotent recipient jobs. If the sender or audience is no longer eligible, the campaign is marked `FAILED` with a system audit event instead of dispatching. The campaign transition and job creation share one serializable transaction, so concurrent worker instances cannot queue the same scheduled campaign twice.\n\n## Dispatch orchestration

`src/lib/queue/dispatch.ts` provides a connector-aware batch dispatcher. It reloads sender state and the recipient's latest consent immediately before dispatch, supplies the stable idempotency key to the connector, and records accepted submissions or classifies retryable/permanent errors. The standalone runner is `npm run queue:worker`; it is gated by `QUEUE_WORKER_ENABLED=true` and refuses to start when no registered connector reports itself configured.

## Not yet enabled

The QR adapter now sends through the self-hosted Baileys runtime at `POST /v1/messages` when `QR_SESSION_SERVICE_URL` and `QR_SESSION_SERVICE_TOKEN` are configured. The Meta Cloud adapter remains a scaffold and reports `configured: false`. The queue runner can process due schedules even when no connector is configured; actual dispatch remains a no-op until a connector reports itself configured. End-to-end delivery still requires deployment and live sender verification. The QR runtime maps Baileys server-ack, delivery-ack and read receipts into `SENT`, `DELIVERED` and `READ` message states. Receipts are persisted in a tenant- and sender-scoped inbox before reconciliation, so early acknowledgements can be applied after the provider message reference is stored. Campaign completion is recalculated after terminal delivery/failure states. Meta Cloud webhook reconciliation remains a separate milestone.

## Database migration

Apply the queue fields migration with `npm run db:deploy`. It adds attempt
limits, next-attempt time, lease timestamp/token and an index for due-job scans.
