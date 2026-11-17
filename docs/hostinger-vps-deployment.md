# Hostinger VPS deployment

This runbook deploys NextWave beside existing websites on an Ubuntu VPS. It does not replace the host Nginx configuration, publish PostgreSQL, or expose the QR runtime to the public internet.

## Topology

- Nginx on the host terminates HTTPS for the chosen subdomain.
- Next.js listens only on host loopback `127.0.0.1:3100`.
- PostgreSQL 16 runs in a private Docker network with a persistent named volume.
- QR runtime is private to the Docker network and persists encrypted credentials in PostgreSQL.
- Queue worker is a separate container and stays disabled until a sender is connected and tested.

## Before changing the VPS

The VPS already hosts `www.aanganresort.in`. Do not stop or recreate existing containers, change the existing site's Nginx server block, replace the firewall rules, or run a broad Docker cleanup.

First inspect the server and record the output:

```bash
hostname
lsb_release -a
nproc
free -h
df -h
sudo ss -ltnp
sudo nginx -t
sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}' 2>/dev/null || true
```

Confirm Docker Engine and the Docker Compose plugin are installed. If not, install them using Docker's official Ubuntu repository instructions. Do not install a second web server or replace the existing Nginx service.

## 1. DNS

Create an `A` record for the chosen subdomain (for example, `nextwave.example.com`) pointing to this VPS's public IPv4 address. Keep the existing Aangan Resort records unchanged. Wait until DNS resolves to the VPS.

## 2. Get the application

Install Git if needed, then clone into a new, dedicated directory:

```bash
sudo mkdir -p /opt/nextwave
sudo chown "$USER":"$USER" /opt/nextwave
git clone https://github.com/everkumud-code/Nextwave.git /opt/nextwave
cd /opt/nextwave
```

For later updates, run `git pull --ff-only` from this directory after reviewing the target commit.

## 3. Configure secrets

```bash
cp .env.hostinger.example .env.hostinger
chmod 600 .env.hostinger
nano .env.hostinger
```

Set the real public HTTPS URL, platform admin email, strong PostgreSQL password, a unique `AUTH_SECRET` (at least 32 characters), a high-entropy `QR_SESSION_SERVICE_TOKEN`, and a 64-character hexadecimal `QR_CREDENTIAL_ENCRYPTION_KEY` (32 random bytes).

The `DATABASE_URL` host must be `db`, not localhost. URL-encode reserved characters in the database password when putting it in `DATABASE_URL`. The raw `POSTGRES_PASSWORD` remains the unencoded password.

Generate secrets on the VPS, for example:

```bash
openssl rand -base64 48
openssl rand -hex 32
```

Use separate generated values for AUTH_SECRET, QR_SESSION_SERVICE_TOKEN, and QR_CREDENTIAL_ENCRYPTION_KEY. The encryption key must be backed up securely and must never be rotated after pairing WhatsApp sessions unless you intentionally plan to lose access to those stored credentials. Never paste secrets into chat or commit `.env.hostinger`.

## 4. Build and start database

```bash
docker compose --env-file .env.hostinger -f docker-compose.hostinger.yml config
docker compose --env-file .env.hostinger -f docker-compose.hostinger.yml build
docker compose --env-file .env.hostinger -f docker-compose.hostinger.yml up -d db
```

Check that the database is healthy:

```bash
docker compose --env-file .env.hostinger -f docker-compose.hostinger.yml ps
```

Apply migrations before starting the application:

```bash
docker compose --env-file .env.hostinger -f docker-compose.hostinger.yml run --rm --no-deps web npm run db:deploy
```

Then start the web app and QR runtime. The queue worker is in the compose profile `worker`, so a plain `up` never starts it (a disabled worker exits with an error and would restart in a loop); start it by name only when you decide to send, see section 6:

```bash
docker compose --env-file .env.hostinger -f docker-compose.hostinger.yml up -d web qr-runtime
docker compose --env-file .env.hostinger -f docker-compose.hostinger.yml ps
```

Check logs:

```bash
docker compose --env-file .env.hostinger -f docker-compose.hostinger.yml logs --tail=100 web qr-runtime
```

Check the web health endpoint locally:

```bash
curl -fsS http://127.0.0.1:3100/api/health
```

The QR runtime should remain private; do not publish port 4100 on the host.

## 5. Add a separate Nginx virtual host

Create a new file such as `/etc/nginx/sites-available/nextwave`. Replace `nextwave.example.com` with the exact subdomain:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name nextwave.example.com;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 120s;
        client_max_body_size 25m;
    }
}
```

Enable only this new site and validate Nginx before reload:

```bash
sudo ln -s /etc/nginx/sites-available/nextwave /etc/nginx/sites-enabled/nextwave
sudo nginx -t
sudo systemctl reload nginx
```

If the symlink already exists, do not create it again. Do not edit or disable the Aangan Resort server block.

After DNS resolves, issue a certificate for only the new subdomain using the installed Certbot Nginx plugin:

```bash
sudo certbot --nginx -d nextwave.example.com
```

Then verify `https://nextwave.example.com/api/health` and sign in.

## 6. First-run safety checks

- Register the platform owner account using the email in `PLATFORM_ADMIN_EMAILS`.
- Verify the admin navigation and client credit console.
- Pair one test WhatsApp sender and wait until its status is CONNECTED.
- Confirm encrypted QR credentials and Signal keys are present in PostgreSQL.
- Import a small, consented test contact list and queue a tiny test campaign only after the provider connection is confirmed.
- Verify provider receipts and reports before inviting paying customers.

The queue worker is disabled by default. To enable it only after the controlled sender test, set `QUEUE_WORKER_ENABLED=true` in `.env.hostinger`, then run:

```bash
docker compose --env-file .env.hostinger -f docker-compose.hostinger.yml up -d --force-recreate queue-worker
```

Do not send unsolicited bulk messages. Respect WhatsApp policies, opt-in, and applicable messaging laws.

## 7. Backups and updates

Back up PostgreSQL and securely back up the QR encryption key. A database backup without the matching encryption key cannot restore paired credentials.

Example database backup (writes a local file; copy it off-server securely):

```bash
docker compose --env-file .env.hostinger -f docker-compose.hostinger.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > nextwave-db-$(date +%F).sql
```

For an update, pull the reviewed commit, rebuild, apply migrations, and recreate only NextWave services:

```bash
git pull --ff-only
docker compose --env-file .env.hostinger -f docker-compose.hostinger.yml build
docker compose --env-file .env.hostinger -f docker-compose.hostinger.yml run --rm --no-deps web npm run db:deploy
docker compose --env-file .env.hostinger -f docker-compose.hostinger.yml up -d web qr-runtime
```

Do not run `docker system prune`, `docker compose down -v`, or delete Docker volumes as routine maintenance. Those commands can remove data or affect other hosted applications.
