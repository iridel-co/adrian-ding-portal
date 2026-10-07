# Adrian Ding Portal

Internal dashboard shell. TanStack Start (frontend + server in one app), Better Auth with Google sign-in, Drizzle + Postgres, shadcn/ui.

Only allowlisted emails can sign in. Manage the list on the **Settings** page.

## Setup

```bash
pnpm install
cp .env.example .env   # fill in the values
pnpm db:migrate
pnpm dev               # http://localhost:3000
```

### CRM test services with Docker Compose

From this directory, start PostgreSQL and the local email capture service:

```sh
cp .env.crm-test.example .env.crm-test  # only needed on first setup
docker compose up -d --wait
node --env-file=.env.crm-test scripts/dev/db.mjs migrate
```

Verify the CRM migration and database rules with synthetic records:

```sh
node --env-file=.env.crm-test scripts/dev/check-crm-schema.mjs
```

This applies pending migrations to the test database, checks that existing CMS
tables and records survive, and cleans up its synthetic records afterward.

The test database is `adrian_ding_crm_test` at `127.0.0.1:55432`. Its local-only
login is `crm_test` / `crm_test_local_only`. The migration helper rejects other
database hosts, ports, and names. It uses `.env.crm-test` explicitly.

The mail capture endpoint is `http://127.0.0.1:55825/emails`, with a health check
at `/health`. It saves messages in a Docker volume and sends no real email.
Future CRM email tests must inject this transport; `CRM_TEST_EMAIL_URL` does not
redirect application sending by itself. Idempotency memory resets when the mail
container restarts. `X-CRM-Test-Fail: true` simulates delivery failure.

```sh
docker compose ps                    # status and health
docker compose logs -f               # follow logs
docker compose stop                  # stop both services
docker compose start                 # start existing containers
docker compose down                  # remove containers, keep test data
```

The named volumes preserve PostgreSQL data and captured messages when containers
are removed. Both published ports bind only to localhost. The containers have no
automatic restart policy; start them when needed. Docker Desktop also shows the
services under the `adrian-ding-crm-test` project.

To inspect the database or captured messages:

```sh
docker compose exec postgres psql -U crm_test -d adrian_ding_crm_test
docker compose exec mail cat /data/mail-capture.jsonl
```

### Google OAuth

1. Create an OAuth client (type "Web application") at https://console.cloud.google.com/apis/credentials
2. Add the redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google`, e.g. `http://localhost:3000/api/auth/callback/google`
3. Put the client ID and secret in `.env`

### First user

Nobody is on the allowlist at first. Put your email in `ADMIN_EMAILS` (comma-separated), sign in, then add everyone else from Settings. Emails in `ADMIN_EMAILS` are always allowed and can't be removed from the UI.

### Image uploads (Cloudflare R2)

1. Create an R2 bucket and turn on public access (a custom domain or the `r2.dev` URL)
2. Create an R2 API token with "Object Read & Write" on that bucket
3. Fill the `R2_*` values in `.env`
4. Add this CORS rule to the bucket (R2 > bucket > Settings > CORS policy), with your portal URLs:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://<portal-domain>"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

The browser uploads files straight to R2 with a short-lived signed URL. The app starts without the `R2_*` values, but uploads fail until they are set.

## Database

- Schema: `src/db/schema/` (one file per area, re-exported from `index.ts`)
- After changing it: `pnpm db:generate`, then `pnpm db:migrate`

## Deploy

Set the same env vars as `.env` on the host. `BETTER_AUTH_URL` must be the public URL, and the Google redirect URI must match it.

**Cloudflare Workers** (main target):

```bash
pnpm deploy:cf   # builds with the cloudflare_module preset, then runs wrangler deploy
```

Add the env vars as Worker secrets, e.g. `npx wrangler secret put DATABASE_URL`. The database has to be reachable from the internet.

With Workers Builds (Git integration), use build command `pnpm build:cf` and deploy command `npx wrangler deploy`.

**Vercel**: import the repo. Nitro detects Vercel automatically.

## Adding pages

1. Add a route file in `src/routes/_app/` (everything in there requires sign-in)
2. Add it to `NAV_ITEMS` in `src/components/app-sidebar.tsx`

Add shadcn components with `pnpm dlx shadcn@latest add <name>`.

### CRM intake implementation

Public POST handlers now save registrations and corporate inquiries with pending
email jobs. Intake is disabled by default with `CRM_INTAKE_ENABLED=false` while
staff APIs and launch verification remain unfinished. See
[the public request contract](docs/crm/CRM-API.md) for payloads, request
keys, responses, and remaining integration work.

Run the guarded Docker integration check from this directory:

```sh
node --env-file=.env.crm-test scripts/dev/check-crm-intake.mjs
```

It applies only local test migrations and removes its synthetic fixtures. It
only sends synthetic mail to the local capture service and never reads live records. Ordinary `pnpm test` runs the HTTP and
schema unit tests and skips the database integration cases unless explicitly
configured for the isolated database.

Email delivery runs after the transaction commits. Failed sends remain recoverable
with the same message and provider key. QR attachments are snapshotted before save
without holding database locks. Staff retry endpoints and launch verification remain
next steps. The guarded check above now includes provider/QR unit checks and local
email recovery tests; Compose must be running.
