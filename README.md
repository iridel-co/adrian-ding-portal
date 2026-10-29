# Adrian Ding Portal

Internal dashboard shell. TanStack Start (frontend + server in one app), Better Auth with Google sign-in, Drizzle + Postgres, shadcn/ui.

Only allowlisted emails can sign in. Manage the list on the **Settings** page.

## Setup

```bash
pnpm install
cp .env.example .env   # fill in the values
docker compose up -d --wait postgres
pnpm db:migrate
pnpm dev               # http://localhost:3000
```

Start Docker Desktop before the Compose command. The local Postgres database
listens on `127.0.0.1:55432`; `.env.example` contains the matching connection
string. If you already have a `.env`, update `DATABASE_URL` to match. Make sure
port 55432 is available before starting the database.

`docker compose down` stops the database and preserves its data volume.
Migrations are applied by `pnpm db:migrate`, not automatically by Compose.
Corporate intake, email sending and scheduler execution are disabled by default.

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

## Public API

The public website reads CMS content from `/api/public/*`.
It is read-only, needs no sign-in and returns published content only.

```bash
curl "http://localhost:3000/api/public/workshops?upcoming=true"
```

See [docs/public-api.md](docs/public-api.md) for every endpoint, its params, its response type and an example response.

## Tests

`pnpm test` runs the unit tests. Database tests require the local Compose
database and explicit opt-in:

```bash
CRM_INTEGRATION_DATABASE_URL="postgres://portal:portal_local_only@127.0.0.1:55432/adrian_ding_portal" pnpm test
```

Database tests create and remove temporary databases without changing the
application database. They never use `DATABASE_URL` automatically.

The workshop registration data layer is implemented, including course-wide
references and registration-owned retry/email records. Its [public intake](docs/crm/REGISTRATION-INTAKE.md) is implemented.
Both workshop emails and [staff APIs](docs/crm/REGISTRATION-STAFF.md) are implemented
and locally verified. See the [integration handoff](docs/crm/REGISTRATION-HANDOFF.md)
for the website developer and staging rollout. See [the step 1 review](docs/crm/STEP-1-REVIEW.md)
and [implementation plan](docs/crm/WORKSHOP-REGISTRATION-PLAN.md).

## Corporate inquiries

`POST /api/corporate-inquiries` accepts a JSON inquiry, a UUID v4
`Idempotency-Key` header, an approved `Origin`, an empty `website` honeypot,
and a `turnstileToken` verified server-side for action `corporate-inquiry`.
Picked dates use `targetDateFrom` and optional `targetDateTo`; rough dates use
`targetDateText` instead. Consent must be `true` before anything is saved.

Fill the corporate settings in `.env.example`. Intake and delivery are disabled
by default. Replace the two staff addresses, sender, sales reply-to, phone and
credibility wording before enabling delivery. Configure deployment request
throttling before enabling public intake. Corporate settings do not require a
workshop payment account.

The inquiry and both email snapshots commit together. A successful save returns
202 `{ accepted: true }` even if delivery fails. Keep the original key and answers
for retries, but get a fresh Turnstile token for every attempt. Changed answers
with an accepted key return 409; replaying the same answers creates no new jobs.
When sending is disabled, saved jobs remain pending. Staff APIs are implemented
as server functions in `src/features/crm/functions.ts`: list/detail, audited
status changes with an expected current status, and eligible email retries.
List filters include All, Non-spam and every inquiry state. Non-spam includes
closed inquiries and excludes only SPAM. History uses bounded pagination, and
responses exclude message payloads, submission hashes and provider identifiers.

Staff retry uses mail settings independently of the public intake switch. Active
leases, completed jobs and reconciliation jobs cannot be retried. Expired
attempts are marked for reconciliation; placeholder snapshots are never sent.
The portal provides `/inquiries` and `/inquiries/:id` pages. Assigned Staff and
Admin accounts land on Inquiries after sign-in. The list supports status filters,
search and pagination; detail shows submitted requirements, Manila deadlines,
valid status actions, email retry controls and history. Contact and proposal
messages are sent outside the portal, then recorded here. CRM server functions
reject cross-site requests and require an approved portal origin for mutations;
public intake keeps its own CORS policy.

CRM roles come from `ADMIN_EMAILS` and `STAFF_EMAILS` deployment settings. Admin
wins if an email appears in both lists. Each CRM request requires a verified
Google account and a current role assignment. The database sign-in list does not
grant CRM access. Staff emails are included in sign-in, but CMS/settings keep
their existing signed-in-user permissions.

### Corporate scheduler

Apply migrations with `pnpm db:migrate`. Set `CORPORATE_SCHEDULER_ENABLED=true`
and a random `CORPORATE_SCHEDULER_SECRET` of at least 32 characters. Restart the
local app after changing `.env`.

`POST /api/internal/corporate-scheduler` requires the secret as a Bearer token.
It queues one reminder per overdue NEW inquiry and retries eligible corporate
emails. Keep `CORPORATE_EMAIL_ENABLED=false` to queue reminders without sending.
Public intake can remain disabled.

```bash
curl -X POST http://localhost:3000/api/internal/corporate-scheduler \
  -H 'Authorization: Bearer <your-secret>'
```

Scheduler hosting is awaiting confirmation. Configure the chosen scheduler to
call this endpoint every 15 minutes with the shared secret. Enabling the endpoint
alone does not start automatic runs. A saved email marked `needs_reconciliation`
requires checking the provider before any new send.

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

### Temporary Turnstile diagnosis

Turnstile is temporarily hard-coded off in `src/features/crm/config.ts` and
web's `src/lib/intake-config.ts`, regardless of `TURNSTILE_ENABLED`. Deploy
portal first, then web. All intake flags, origin checks, honeypot, validation,
email configuration and payment-account requirements still apply. This does
not necessarily resolve `intake_unavailable`.

Restore the environment switch in both configuration files after diagnosis,
then deploy web verification before portal enforcement. Keep the existing keys.
While disabled, public submissions have no Turnstile bot protection.


### Public form runtime logs

Both public submission handlers emit JSON through server-side `console.error`
and `console.info`. Vercel captures this console output in the Portal project's
runtime Logs tab automatically; no logging package, new environment variable,
or `vercel.json` change is required. See [Vercel Function Logs](https://vercel.com/docs/functions/logs).

After deploying Portal, reproduce the failure, then open the Portal project's
Logs tab, select the deployment/environment serving `portal.adrianding.com`,
and filter to `/api/corporate-inquiries` or `/api/registrations`. Search for:

- `crm_intake_config_invalid`: configuration field names and a reason such as
  `intake_disabled`, `invalid_format`, or `email_delivery_not_configured`.
- `crm_intake_failed`: form, failing stage, HTTP status, public error code and
  whether the exception was unexpected. Stages distinguish origin configuration,
  origin check, method, form configuration, input validation, verification,
  database initialization, save, and email handling. Shared environment schema
  failures also include their field names. Use the surrounding invocation logs
  to pair configuration failures with their request's form/stage.
- `crm_intake_accepted`: the handler is returning HTTP 202 after a successful save.
  Email delivery can still fail separately; check the saved email job state.

For example, an invalid registration payment-account setting produces:

```json
{"event":"crm_intake_config_invalid","reason":"invalid_format","fields":["REGISTRATION_PAYMENT_ACCOUNT_ID"]}
```

Logs contain no submitted answers, token/secret values, raw headers, exception
messages or stacks. Public error responses remain unchanged. The generic
`intake_unavailable` response alone still cannot identify the failing setting.
Local logs appear in the server terminal. Previously deployed requests will not
gain these diagnostics retroactively; reproduce after the new Portal deployment.
