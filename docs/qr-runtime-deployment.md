# QR Runtime Deployment

The QR runtime is a separate, long-running Node.js service. It owns live socket connections and encrypted session credentials; the Next.js application calls it through the internal HTTP API.

## Required environment

Configure these variables on the runtime service:

- `DATABASE_URL`: same PostgreSQL database used by the NextWave web application
- `QR_SESSION_SERVICE_TOKEN`: high-entropy bearer token shared with the web application
- `QR_CREDENTIAL_ENCRYPTION_KEY`: exactly 64 hexadecimal characters (32 random bytes)
- `QR_SESSION_PORT`: normally `4100`
- `QR_LOG_LEVEL`: optional, defaults to `silent`

Configure these variables on the web application:

- `QR_SESSION_SERVICE_URL`: internal HTTPS URL of the runtime service
- `QR_SESSION_SERVICE_TOKEN`: same token as the runtime service
- `QR_SESSION_REQUEST_TIMEOUT_MS`: at least `30000`
- `QUEUE_WORKER_ENABLED`: set to `true` on a separate persistent worker service after QR runtime is reachable
- `QUEUE_WORKER_BATCH_SIZE`: optional, defaults to `25`
- `QUEUE_WORKER_POLL_INTERVAL_MS`: optional, defaults to `1000`

Generate secrets with a password manager or a cryptographically secure generator. Keep the encryption key stable and backed up: losing it makes encrypted credentials unreadable. Never commit real secrets.

## Database

Apply migrations before starting either service:

```bash
npm run db:deploy
```

The runtime stores the Baileys credential object and Signal keys in PostgreSQL encrypted with AES-256-GCM. Pairing QR payloads remain transient and are not stored in the database.

## Run locally

```bash
npm run db:generate
npm run qr:dev
```

Health endpoints:

- `GET /healthz`: process liveness
- `GET /readyz`: PostgreSQL readiness

The runtime API is protected by the server-to-server bearer token.

## Container deployment

Build from the repository root using `services/qr-runtime/Dockerfile`:

```bash
docker build -f services/qr-runtime/Dockerfile -t nextwave-qr-runtime .
docker run --env-file .env -p 4100:4100 nextwave-qr-runtime
```

The container must have outbound network access for its messaging WebSocket connections and access to the PostgreSQL database.

## Queue worker

Run the queue worker as a separate persistent Node.js process with the same database and web-app QR runtime URL/token:

```bash
npm run queue:worker
```

The worker claims durable queue rows, rechecks sender and latest consent state, and calls the QR runtime. It refuses to start until at least one connector reports itself configured. Keep it disabled until the runtime and a connected sender have been verified in the target environment.

## Scaling and operations

- Run as a persistent service, not a short-lived serverless function.
- Start with one runtime replica. Live sockets are tracked in-process; horizontal sharding and distributed session ownership are a separate scaling milestone.
- Keep the database and encryption key durable across deploys.
- Monitor `/healthz`, `/readyz`, reconnect failures and session error states.
- Do not expose the runtime service publicly when an internal network route is available.
