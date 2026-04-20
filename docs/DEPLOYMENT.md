# Deployment Guide

Guide for deploying Excelsia ERP to a production VPS or cloud host. Target
audience: the engineer running the first go-live for a real client.

---

## Prerequisites

| Component     | Version                 | Notes                                                       |
| ------------- | ----------------------- | ----------------------------------------------------------- |
| Node.js       | `>= 20`                 | 20 LTS is recommended; 22 works too                         |
| npm           | `>= 10`                 | Ships with Node 20                                          |
| Docker        | `>= 24`                 | Compose v2 plugin required                                  |
| PostgreSQL    | `16.x`                  | Via official image or managed service (RDS, Supabase, Neon) |
| Redis         | `7.x`                   | Used for BullMQ jobs + rate limiting                        |
| MinIO         | Latest                  | Or any S3-compatible storage (AWS S3 works)                 |
| Reverse proxy | nginx / Caddy / Traefik | Terminates TLS; forwards to API and web                     |

A VPS with **2 vCPU / 4 GB RAM** is the recommended minimum for a single-tenant
production install. The database benefits disproportionately from more memory
— if running PostgreSQL on the same box, bump to 8 GB.

---

## Environment variables (complete list)

Copy `.env.example` to `.env` and fill in the values. Every variable used by
the stack is listed below. **Required** means the process will not start (or
will fail at runtime on the first affected request) without a real value.

### General

| Variable      | Description                                                                                                                             | Example      | Required |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------ | :------: |
| `NODE_ENV`    | Runtime mode. Set to `production` for live deploys. Controls logging, error detail, source maps, and the `secure` flag on auth cookies. | `production` |    ✅    |
| `API_PORT`    | Port the NestJS API listens on. Put a reverse proxy in front — do not expose this port publicly.                                        | `3001`       |    ✅    |
| `APP_VERSION` | Version string returned by `GET /api/health`. Bump on each release for traceability.                                                    | `1.0.0`      |    ⚪    |

### PostgreSQL

| Variable            | Description                                                        | Example                                                                     | Required |
| ------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- | :------: |
| `POSTGRES_HOST`     | DB hostname, reachable from the API process.                       | `postgres` (compose) / `db.internal`                                        |    ✅    |
| `POSTGRES_PORT`     | DB port.                                                           | `5432`                                                                      |    ✅    |
| `POSTGRES_DB`       | Database name.                                                     | `excelsia_prod`                                                             |    ✅    |
| `POSTGRES_USER`     | Role used by the API. Should **not** have BYPASSRLS in production. | `excelsia_app`                                                              |    ✅    |
| `POSTGRES_PASSWORD` | DB password. Rotate on every deploy.                               | `<32-byte random>`                                                          |    ✅    |
| `DATABASE_URL`      | Full connection string used by Prisma. Must match the above.       | `postgresql://excelsia_app:<pwd>@postgres:5432/excelsia_prod?schema=public` |    ✅    |

### Redis

| Variable     | Description                     | Example              | Required |
| ------------ | ------------------------------- | -------------------- | :------: |
| `REDIS_HOST` | Redis hostname.                 | `redis`              |    ✅    |
| `REDIS_PORT` | Redis port.                     | `6379`               |    ✅    |
| `REDIS_URL`  | Full Redis URL, used by BullMQ. | `redis://redis:6379` |    ✅    |

### MinIO / S3

| Variable              | Description                                                  | Example                   | Required |
| --------------------- | ------------------------------------------------------------ | ------------------------- | :------: |
| `MINIO_ENDPOINT`      | Hostname (no scheme).                                        | `minio`                   |    ✅    |
| `MINIO_API_PORT`      | S3 API port.                                                 | `9000`                    |    ✅    |
| `MINIO_CONSOLE_PORT`  | Web console port. Gate behind a VPN / don't expose publicly. | `9001`                    |    ⚪    |
| `MINIO_ROOT_USER`     | Access key.                                                  | `<rotated>`               |    ✅    |
| `MINIO_ROOT_PASSWORD` | Secret key.                                                  | `<rotated>`               |    ✅    |
| `MINIO_BUCKET`        | Bucket name. Created by `minio-init` on first boot.          | `excelsia-documents`      |    ✅    |
| `MINIO_USE_SSL`       | Whether the SDK should connect via HTTPS.                    | `true` in prod behind TLS |    ⚪    |

### Sentry (observability)

| Variable                 | Description                                                  | Example                 | Required |
| ------------------------ | ------------------------------------------------------------ | ----------------------- | :------: |
| `SENTRY_DSN`             | Error reporting DSN for the API. **Required** in production. | `https://…@sentry.io/…` |    ✅    |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN exposed to the browser (web app).                        | `https://…@sentry.io/…` |    ✅    |
| `SENTRY_ENVIRONMENT`     | Environment label.                                           | `production`            |    ✅    |
| `SENTRY_AUTH_TOKEN`      | Used at build time to upload source maps.                    | `sntrys_…`              |    ⚪    |
| `SENTRY_ORG`             | Sentry organization slug.                                    | `excelsia`              |    ⚪    |
| `SENTRY_PROJECT`         | Sentry project slug.                                         | `erp-api`               |    ⚪    |

### Security (CORS, rate limit)

| Variable         | Description                                                          | Example                      | Required |
| ---------------- | -------------------------------------------------------------------- | ---------------------------- | :------: |
| `FRONTEND_URL`   | The only origin allowed by CORS. Exact match (scheme + host + port). | `https://app.yourdomain.com` |    ✅    |
| `RATE_LIMIT_TTL` | Rolling window (seconds) for the global throttler.                   | `60`                         |    ✅    |
| `RATE_LIMIT_MAX` | Max requests per IP per window.                                      | `100`                        |    ✅    |

### JWT / Auth

| Variable                   | Description                                                                                  | Example             | Required |
| -------------------------- | -------------------------------------------------------------------------------------------- | ------------------- | :------: |
| `JWT_SECRET`               | Signs access-token cookies. **MUST** be rotated from the default. `openssl rand -base64 48`. | `<≥32-byte random>` |    ✅    |
| `JWT_EXPIRES_IN`           | Access-token lifetime.                                                                       | `8h`                |    ✅    |
| `REFRESH_TOKEN_SECRET`     | Signs refresh-token cookies. Separate secret from JWT_SECRET.                                | `<≥32-byte random>` |    ✅    |
| `REFRESH_TOKEN_EXPIRES_IN` | Refresh-token lifetime.                                                                      | `7d`                |    ✅    |
| `COOKIE_DOMAIN`            | Where the browser accepts the cookie. Share across subdomains with a leading dot.            | `.yourdomain.com`   |    ✅    |

### Frontend (Next.js)

| Variable              | Description                                                                             | Example                      | Required |
| --------------------- | --------------------------------------------------------------------------------------- | ---------------------------- | :------: |
| `NEXT_PUBLIC_API_URL` | Base URL the browser uses to reach the API. Baked into the client bundle at build time. | `https://api.yourdomain.com` |    ✅    |

---

## Deployment steps

Target layout on the VPS:

```
/opt/excelsia/
├── .env                       (production env — chmod 600, root:root)
├── docker-compose.prod.yml
├── infra/nginx/prod.conf
├── infra/nginx/certs/         (TLS via certbot / lego / cloudflare)
└── backups/                   (cron dumps end up here)
```

### 1. Clone the repository

```bash
ssh deploy@your-vps
sudo mkdir -p /opt/excelsia && sudo chown deploy:deploy /opt/excelsia
cd /opt/excelsia
git clone https://github.com/<your-org>/erp.git .
git checkout main
```

### 2. Configure `.env` for production

```bash
cp .env.example .env
vim .env  # fill values — see the table above
chmod 600 .env
```

Critical checks before saving:

- `NODE_ENV=production`
- `JWT_SECRET` and `REFRESH_TOKEN_SECRET` rotated (NOT the defaults)
- `FRONTEND_URL` = your real frontend domain
- `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD` rotated
- `COOKIE_DOMAIN` matches your real domain (e.g. `.excelsia.cl`)

### 3. Run database migrations

```bash
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"

# Run migrations from the repo (needs local Node + Prisma)
npm ci
npx prisma migrate deploy --schema=apps/api/prisma/schema
```

Use `migrate deploy`, **not** `migrate dev` — the latter resets data.

### 4. Seed initial data (first deploy only)

```bash
npx ts-node apps/api/prisma/seed.ts
```

This creates: tenant + company, admin user (`admin@excelsia.dev` /
`Admin1234!`), default categories, counterparties, cost centers, and the
2026 fiscal periods.

**Immediately change the admin password after first login.** The seed is
meant for demo — for a real client, follow up by creating the client's user
through the admin UI and disabling the demo account.

### 5. Build and start the full stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build

docker compose -f docker-compose.prod.yml ps
# All services should show `healthy`.

curl -fsS http://localhost/api/health
# → {"status":"ok","version":"1.0.0","environment":"production", ...}
```

### 6. Put it behind TLS

Point `app.yourdomain.com` and `api.yourdomain.com` (A records) at the VPS,
then use certbot or lego to obtain certificates into `infra/nginx/certs/`.
Reload nginx:

```bash
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

---

## Production checklist

Run through this list before sending the URL to the client.

### Secrets rotated

- [ ] `JWT_SECRET` changed from the default (≥32 bytes, unique)
- [ ] `REFRESH_TOKEN_SECRET` changed from the default (≥32 bytes, unique)
- [ ] `POSTGRES_PASSWORD` changed
- [ ] `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` changed
- [ ] Demo `admin@excelsia.dev` password changed after first login (or disabled)

### Config

- [ ] `NODE_ENV=production`
- [ ] `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` configured, errors flowing
- [ ] `FRONTEND_URL` set to the real domain (HTTPS, no trailing slash)
- [ ] `COOKIE_DOMAIN` set to the real domain (e.g. `.yourdomain.com`)
- [ ] `NEXT_PUBLIC_API_URL` set to the real API origin

### Runtime

- [ ] HTTPS terminated at nginx, HTTP → HTTPS redirect enabled
- [ ] HSTS (already sent by Helmet — `max-age=31536000; includeSubDomains`) working
- [ ] `GET /api/health` returns 200 from the public URL
- [ ] Rate limiting verified: 6+ logins in under a minute → `429`
- [ ] CORS verified: a request from a foreign origin is blocked

### Ops

- [ ] Daily `pg_dump` cron configured, uploading to offsite storage
- [ ] MinIO bucket replicated or included in backups
- [ ] Log retention policy (at least 30 days)
- [ ] Alerting from Sentry wired to on-call (email or Slack)
- [ ] `docker compose -f docker-compose.prod.yml restart` tested on the host

### Nice-to-have (recommended, not blocking)

- [ ] Uptime monitoring hitting `/api/health` every minute
- [ ] `fail2ban` or a WAF in front for abuse
- [ ] Automated DB migrations on deploy (CI step before `up -d`)

---

## Upgrades

For a standard upgrade (new feature release):

```bash
cd /opt/excelsia
git fetch --all --tags
git checkout v1.1.0          # or `main` if you track tip

npx prisma migrate deploy --schema=apps/api/prisma/schema
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml exec api wget -qO- http://localhost:3001/api/health
```

If the migration fails partway, restore from the last `pg_dump` and page
the on-call engineer. See [RUNBOOK.md](./RUNBOOK.md) for recovery steps.
