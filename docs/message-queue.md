# Message queue architecture

## Current implementation

Campaign queueing is a tenant-scoped transaction exposed by
`POST /api/campaigns/{campaignId}/queue`.

Before creating jobs, the operation verifies:
- the campaign is still a draft;
- a connected, non-archived sender belongs to the active workspace;
- the message body exists and uses supported contact variables;
- the planned send time is not in the future;
- the selected audience is within the 5,000-recipient limit;
- every selected contact is active and its latest WhatsApp marketing consent is granted.

The transaction creates one `Message` row per recipient and moves the campaign
to `QUEUED`. Idempotency keys are deterministic per campaign/contact pair:
`campaign:{campaignId}:contact:{contactId}`. A database unique constraint
prevents duplicate job creation on retries.

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

## Not yet enabled

There is not yet a dispatch worker that calls a live connector. The current
Meta Cloud and experimental QR adapters are scaffolds/disabled implementations.
Queueing creates durable jobs; it does not send messages. Delivery webhooks,
provider-aware retry classification, campaign completion reconciliation and
scheduled dispatch remain separate milestones.

## Database migration

Apply the queue fields migration with `npm run db:deploy`. It adds attempt
limits, next-attempt time, lease timestamp/token and an index for due-job scans.
