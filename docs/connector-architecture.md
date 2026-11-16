# Connector architecture

The application uses a provider-neutral `MessagingConnector` contract. Campaign orchestration must not call provider SDKs directly.

## Registered adapters

- `META_CLOUD_API`: official Meta Cloud API adapter scaffold. It remains non-operational until Embedded Signup, credentials, templates, consent enforcement and signed webhooks are implemented and tested.
- `QR_PROVIDER_EXPERIMENTAL`: disabled provider boundary. It intentionally contains no undocumented WhatsApp protocol implementation. It may only be connected to an authorised provider after legal, security and data-processing review.

## Required production controls

1. Resolve sender and organisation ownership server-side.
2. Verify valid consent and suppression status before creating a send job.
3. Enforce provider-specific limits; never use sender rotation to evade restrictions.
4. Use idempotency keys for all message submissions.
5. Store credentials in an encrypted secrets vault, never in browser storage.
6. Verify provider webhooks and deduplicate event IDs.
7. Distinguish accepted, sent, delivered, read and failed states.
8. Pause a sender when a provider reports a restriction or an unhealthy session.

## Current implementation status

Both adapters are scaffolds. No live message delivery or QR session creation is enabled in this repository yet.
