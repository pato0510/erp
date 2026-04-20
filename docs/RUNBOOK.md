# Runbook

Operational playbook for Excelsia ERP. Use this when something is on fire in
production. For first-time setup see [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Common issues and solutions

### API won't start

Symptoms: `docker compose ps` shows `excelsia-api` in `Restarting` or
`unhealthy`, or the container exits immediately after boot.

Check, in order:

1. **DATABASE_URL is reachable**

   ```bash
   docker compose -f docker-compose.prod.yml exec api sh -c \
     'nc -zv "$POSTGRES_HOST" "$POSTGRES_PORT"'
   ```

   If this fails, the API cannot reach Postgres — fix the network/hostname
   before anything else.

2. **PostgreSQL is healthy**

   ```bash
   docker compose -f docker-compose.prod.yml ps postgres
   docker compose -f docker-compose.prod.yml logs --tail=50 postgres
   ```

3. **Pending migrations**

   ```bash
   npx prisma migrate status --schema=apps/api/prisma/schema
   # If "not applied" entries are listed:
   npx prisma migrate deploy --schema=apps/api/prisma/schema
   ```

   Prisma refuses to start with a drifted schema.

4. **Missing env vars**
   The app fails fast if `JWT_SECRET`, `DATABASE_URL`, or `REDIS_URL` are
   empty. Confirm `/opt/excelsia/.env` is populated and mounted:

   ```bash
   docker compose -f docker-compose.prod.yml exec api env | grep -E 'JWT|DATABASE|REDIS'
   ```

5. **Port collision**
   `API_PORT` is already in use on the host. Change it or stop the other
   process.

---

### Login not working

Symptoms: user reports "invalid credentials" when they know the password is
right, or sees a spinner with no response.

1. **JWT_SECRET is set and non-default**
   If it's still the example value, tokens signed on boot look valid locally
   but any attacker knowing the default can forge them. Rotate it:

   ```bash
   openssl rand -base64 48
   # Paste into .env and restart api
   docker compose -f docker-compose.prod.yml restart api
   ```

2. **FRONTEND_URL matches the browser origin exactly**
   CORS is strict: `https://app.example.com` and `https://app.example.com/`
   are treated as different origins in some setups; no trailing slash.

   ```bash
   grep FRONTEND_URL .env
   # Compare with the URL bar in the browser — scheme, host, port.
   ```

   Wrong origin → browser blocks preflight → frontend shows "invalid
   credentials" because the request never reaches the API.

3. **Rate limit tripped**
   After 5 failed login attempts within 1 minute, the throttler blocks the
   IP with `429 Too Many Requests`. Wait 60 seconds or restart Redis / the
   API process (the in-memory counter resets on reboot). See [below](#reset-rate-limits).

4. **User actually exists and has the expected hash**

   ```bash
   docker compose -f docker-compose.prod.yml exec postgres \
     psql -U "$POSTGRES_USER" "$POSTGRES_DB" \
     -c "SELECT id, email, is_active, length(password_hash) FROM users WHERE email = 'admin@excelsia.dev';"
   ```

   If `is_active` is false or the row is missing, re-run the seed or create
   the user through the admin UI. The seed upsert refreshes the password
   hash to `Admin1234!` on every run.

5. **Cookie domain mismatch**
   If `COOKIE_DOMAIN=.yourdomain.com` but the user accesses
   `app.otherdomain.com`, the browser rejects the Set-Cookie. Confirm both
   the frontend and API are served from the configured domain.

---

### Bank sync failing

Symptoms: `/banco` shows last sync as "Failed" or no new movements appear.

1. **Redis is running**

   ```bash
   docker compose -f docker-compose.prod.yml ps redis
   docker compose -f docker-compose.prod.yml exec redis redis-cli ping
   # Expect: PONG
   ```

   If Redis is down, BullMQ can't accept jobs and `POST …/sync-movements`
   will 500.

2. **BullMQ queue status**

   ```bash
   # From inside the api container:
   docker compose -f docker-compose.prod.yml exec api node -e "
     const { Queue } = require('bullmq');
     const q = new Queue('bank-sync-queue', { connection: { host: process.env.REDIS_HOST, port: +process.env.REDIS_PORT }});
     (async () => {
       console.log(await q.getJobCounts('waiting', 'active', 'failed', 'completed'));
       await q.close();
     })();
   "
   ```

   High `failed` counts point at provider credentials. Inspect the last
   failure reason through `/api/banking/connections/:id/sync-history`.

3. **Provider credentials**
   For the `mock` provider there are no real credentials — so failures mean
   application bugs. For a real provider (`fintoc`, `unnax`) confirm the
   credentials in the `bank_connections.provider_credentials` JSON column.

4. **Sync history for the connection**
   ```sql
   SELECT id, status, started_at, error_message
   FROM bank_sync_runs
   WHERE bank_connection_id = 'CONN-UUID'
   ORDER BY started_at DESC
   LIMIT 10;
   ```

---

### Dashboard showing zeros

Symptoms: all KPIs render as `$0` or "0 movimientos" even though there is
data in the DB.

1. **Fiscal period exists for the current month**

   ```sql
   SELECT id, name, status FROM fiscal_periods
   WHERE company_id = 'COMPANY-UUID' AND year = extract(year from now()) AND month = extract(month from now());
   ```

   The dashboard resolves the current period. If none exists the API throws 404. Generate periods:

   ```bash
   curl -X POST -H "Cookie: access_token=..." \
     "https://api.yourdomain.com/api/fiscal-periods/generate/2026"
   ```

2. **Alerts haven't been generated yet**

   ```bash
   curl -X POST -H "Cookie: access_token=..." \
     "https://api.yourdomain.com/api/alerts/generate"
   ```

3. **A section is silently failing**
   After the hardening in CLS-001/QA-001, each dashboard section is wrapped
   in `try/catch` with a safe default. Grep the API logs for the specific
   section:

   ```bash
   docker compose -f docker-compose.prod.yml logs api | grep "section failed"
   ```

   You'll see lines like `[DashboardService] Tax section failed: …` pointing
   at the exact query that broke.

4. **RLS is filtering the user out**
   If `x-company-id` header is missing or the logged-in user has no
   membership in that company, RLS returns empty result sets. Confirm:
   ```sql
   SELECT role, is_active FROM memberships
   WHERE user_id = 'USER-UUID' AND company_id = 'COMPANY-UUID';
   ```

---

### Period close is blocked

Symptoms: the "Cerrar período" button is disabled or `POST /api/closing/close`
returns 400.

Check the checklist:

```bash
curl -sS -H "Cookie: access_token=..." -H "x-company-id: COMPANY-UUID" \
  "https://api.yourdomain.com/api/closing/checklist?fiscalPeriodId=PERIOD-UUID" | jq
```

Rules that block the close:
| Rule | Blocking threshold |
|---|---|
| `movements_confirmed` | **BLOCKED** if any DRAFT movements exist |
| `bank_reconciliation` | **BLOCKED** if <50% reconciled |

All other checks are warnings. Resolve DRAFTs (confirm or cancel them) and
push bank reconciliation past 50% before retrying.

---

## Useful commands

### Check migration state

```bash
npx prisma migrate status --schema=apps/api/prisma/schema
```

### Reset rate limits

The throttler stores counters in memory, so a process restart clears them.
For a single-node deploy:

```bash
docker compose -f docker-compose.prod.yml restart api
```

If you've wired the throttler to Redis (multi-node), instead:

```bash
docker compose -f docker-compose.prod.yml exec redis redis-cli \
  --scan --pattern 'throttle:*' | xargs -r -I {} redis-cli del {}
```

### View recent audit log entries

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U "$POSTGRES_USER" "$POSTGRES_DB" \
  -c "SELECT created_at, user_id, company_id, action, table_name, record_id
      FROM audit_logs
      ORDER BY created_at DESC
      LIMIT 50;"
```

### Verify RLS is set inside a transaction

```sql
-- Inside a debugging session:
BEGIN;
SET LOCAL rls.company_id = 'COMPANY-UUID';
SELECT current_setting('rls.company_id', true);  -- should echo your UUID
SELECT count(*) FROM movements;                   -- RLS applies here
ROLLBACK;
```

### Tail API logs

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=100 api
```

### Trigger a manual sync

```bash
# Bank (BullMQ job):
curl -X POST -H "Cookie: access_token=..." -H "x-company-id: COMPANY-UUID" \
  "https://api.yourdomain.com/api/banking/connections/CONN-UUID/sync-movements"

# Tax (synchronous):
curl -X POST -H "Cookie: access_token=..." -H "x-company-id: COMPANY-UUID" \
  "https://api.yourdomain.com/api/tax/sync-all?fiscalPeriodId=PERIOD-UUID"

# Alerts:
curl -X POST -H "Cookie: access_token=..." -H "x-company-id: COMPANY-UUID" \
  "https://api.yourdomain.com/api/alerts/generate"
```

### Back up the database

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "/opt/excelsia/backups/dump-$TIMESTAMP.sql.gz"
```

Run daily via cron. Rotate the `/opt/excelsia/backups` directory to keep the
last 30 days.

### Restore a database backup

**Destructive — will overwrite the current DB.** Only during incident response.

```bash
gunzip < /opt/excelsia/backups/dump-20260420-120000.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T postgres \
  psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```

---

## On-call checklist

When you're paged:

1. Check `/api/health` first — is the API up at all?
2. Look at Sentry for recent errors clustered by endpoint.
3. Check `docker compose ps` — any service unhealthy?
4. Tail the logs of the unhealthy service.
5. If you need to restart: `docker compose restart <service>` is safer than
   `up -d --build` (which would redeploy code).
6. Document what happened in `/opt/excelsia/incidents/YYYY-MM-DD.md` once
   the dust settles.
