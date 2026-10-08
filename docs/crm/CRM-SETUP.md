# CRM implementation setup

For the current admin dashboard demo and manual testing instructions, see
[the local dashboard guide](CRM-DASHBOARD-DEMO.md). The setup history below records
the earlier backend implementation.

Step 1 completed on October 6, 2026.

## Stacked branch

- Repository: `portal/`.
- CRM branch: `codex/crm-api-stacked`.
- Base: `feature/content-cms` at `45a296da24e18e611991590dde6c3c7cf75bcf26`.
- [CMS PR #1](https://github.com/iridel-co/adrian-ding-portal/pull/1) was verified open against `main`.
- The CRM branch has no upstream configured, preventing an ordinary push from updating the CMS branch. When ready, publish the CRM branch explicitly and target its PR at `feature/content-cms`.
- No CRM application code or commits were made during setup. Development service configuration and helper scripts were added when Bryan requested Docker Compose.

Use the CMS feature modules, shared actor/database types, audit helper, media URL helper, and existing Vitest configuration. The course-code lock remains the CMS placeholder until CRM implementation.

## Docker Compose services

At Bryan's request, the test services now use `portal/compose.yaml`. Docker Desktop manages the `adrian-ding-crm-test` project, with `postgres` and `mail` services. Both services publish only localhost ports and have no automatic restart policy.

- TCP binding: `127.0.0.1:55432`.
- Database: `adrian_ding_crm_test`.
- Local-only login: `crm_test` / `crm_test_local_only`.
- PostgreSQL image: `postgres:18-alpine`.
- Database data: named volume `adrian-ding-crm-test_postgres-data`.
- Mail capture: `http://127.0.0.1:55825/emails`.
- Captured messages: `/data/mail-capture.jsonl` in named volume `adrian-ding-crm-test_mail-data`.
- Local settings: `portal/.env.crm-test`, with an example in `portal/.env.crm-test.example`.
- The existing `.env` and its database are not used by this setup.

The PostgreSQL volume mounts at `/var/lib/postgresql`, following the [official PostgreSQL image's layout for version 18](https://github.com/docker-library/docs/blob/master/postgres/README.md#pgdata).

Run these commands from `portal/`:

```sh
# First setup only; do not overwrite existing local settings
cp .env.crm-test.example .env.crm-test

# Start and wait for health checks
docker compose up -d --wait

# Status and logs
docker compose ps
docker compose logs -f

# Verify database and migration ledger
node --env-file=.env.crm-test scripts/dev/db.mjs status

# Apply subsequent migrations to the isolated database
node --env-file=.env.crm-test scripts/dev/db.mjs migrate

# Stop and start existing containers
docker compose stop
docker compose start

# Remove containers while retaining both data volumes
docker compose down
```

The database helper rejects any host, port, or database name outside this setup. Compose creates the test database; the helper applies the repository's migrations. Sandboxed execution needs permission to use the Docker socket and localhost connections.

## Controlled email transport

A local HTTP mail capture server runs in the `mail` container. It never contacts an email provider.

```sh
# Inspect captured messages
docker compose exec mail cat /data/mail-capture.jsonl
```

`GET /health` verifies readiness. `POST /emails` accepts JSON and returns a generated message ID. Repeating an `Idempotency-Key` with the same body returns the same ID; a different body returns `409`. The `X-CRM-Test-Fail: true` header simulates a `503` delivery failure. All four behaviors were verified.

The mock's idempotency memory lasts only for its process lifetime; it does not reproduce provider retention or delivery guarantees. `CRM_TEST_EMAIL_URL` in the test settings identifies this harness endpoint. Future CRM tests must explicitly inject the local transport or intercept provider fetch calls; production email sending is not implemented or redirected by this setting.

## Baseline verification

- Locked CMS dependencies installed without modifying the manifest or lockfile.
- Dependency build scripts were skipped; the existing `workerd` approval placeholder was not changed. This setup verifies Node-based tests, not Cloudflare runtime behavior.
- `pnpm test`: 10 files, 54 tests passed.
- `pnpm typecheck`: passed.
- The Portal branch was clean before the requested Compose configuration changes.
- Compose configuration and development script syntax checks passed.
- Both containers passed health checks. All three CMS migrations and all 17 public tables were verified in the Compose database.
- Mail capture, idempotent retry, conflicting key reuse, and simulated delivery failure passed against the containerized transport.
- Container removal and recreation preserved the database migration ledger and captured messages in their named volumes.

Both Compose services were left running after verification. Use `docker compose stop` to stop them or `docker compose down` to remove the containers while keeping their data.

## Previous native setup

The original native PostgreSQL process and native mail capture process were stopped when switching to Compose. The native test database files and downloaded binaries remain in the ignored `portal/.crm-test/` directory as an unused local backup. Compose uses its own fresh volumes. The native database contained the CMS migrations and no copied customer data.

## CRM schema verification

The CRM schema and migration `20261006140302_crm_core` were added on October 6, 2026. The Docker database now contains four applied migrations and 20 public tables. The new tables are `registration`, `corporate_inquiry`, and `crm_email_job`.

```sh
node --env-file=.env.crm-test scripts/dev/check-crm-schema.mjs
```

This check applies pending migrations to the test database and verifies that existing CMS columns and synthetic records survive. It exercises field preservation, concurrent duplicate signups, submission-key uniqueness, consent, cancellation, foreign keys, email ownership, immutable messages, delivery state, and rollback. It removes its synthetic records afterward.

The check passed, alongside 54 existing tests, typecheck, production build, and a generation check confirming the schema matches its migration snapshot. Public form validation was subsequently added with eight tests, bringing the passing unit suite to 62; typecheck also passed. Service operations, HTTP handling, catalogue/QR fixtures for API tests, and authentication scenarios remain for subsequent steps. Real Google sign-in, R2 access, Resend delivery, deployment, and the live migration ledger remain unverified.

## Public intake verification

The two public POST/OPTIONS handlers and their database services were implemented
on October 6, 2026. Migration `20261006150228_crm_submission_keys` adds the
accepted-key receipt table, bringing the isolated Docker database to five
migrations and 21 public tables. Existing CMS tables were not rebuilt.

```sh
node --env-file=.env.crm-test scripts/dev/check-crm-intake.mjs
```

The check applies pending local migrations and removes its own synthetic records.
It verifies HTTP boundaries, saved registrations/inquiries, immutable pending
email messages, retry keys, concurrent seat allocation and duplicate requests,
cancelled-key replay, atomic rollback, and CMS course-code/capacity rules including
concurrent staff edits. The QR URL helper is mocked to a synthetic HTTPS URL; no
R2 object request or provider send occurs.

Intake remains disabled by default. Actual email delivery, usable QR verification,
platform rate limiting, staff APIs, the public session lookup, frontend integration,
and deployment remain later work. Production database contents and its migration
ledger have not been read or changed by these checks.

The final intake verification passed 66 unit tests and seven isolated database
integration tests, plus typecheck, build, schema constraints, and a migration
snapshot consistency check. The built Node server was also exercised over
localhost with synthetic Docker fixtures: both POST routes, OPTIONS, saves, key
replay/mismatch, full-session rejection, pending jobs, and malformed JSON passed.
A one-line Nitro configuration change bundles tslib because the dependency trace
omitted its Node import entry, which otherwise caused requests to fail before
reaching the routes. The temporary server stopped and its fixtures were removed.
No real provider sends or production database operations occurred.

## Email implementation, October 7, 2026

Email delivery now follows the committed save. The native Resend transport maps
HTTP fields, uses each immutable job UUID as its duplicate-send key, and applies
a ten-second send timeout. Atomic claims use a 60-second lease and attempt fencing.
Failed or interrupted jobs can recover within a conservative 23-hour-59-minute
window after their first attempt; older attempted messages require reconciliation
instead of another send. Already paid or cancelled payment instructions are skipped.
Public replay and duplicate signup do not dispatch jobs again. A failed send never
undoes a saved submission or changes its accepted acknowledgment.

The configured payment QR is read from R2 outside database locks with a five-second
timeout and 1 MiB limit, checked for matching type, size, and image signature, and
saved as a base64 attachment with the immutable message. Final intake rechecks
availability and media metadata after the read. These limits are implementation
defaults. Tests use synthetic QR content; launch still requires verification of the
real QR, sender domain, recipients, deployed schema, and platform abuse controls.

The completed setup, schema, validation, and submission handler work was recorded
as four separate local commits before this email stage. Documentation needed for
review is also included under portal/docs/crm because the parent workspace docs
are outside the portal Git repository. No commits were pushed.

Email verification passed four provider/QR unit tests and six Docker recovery
tests alongside the existing intake checks. The full unit suite passes 70 tests;
13 database integration tests pass against Docker, for 83 distinct checks.
Typecheck and production build pass. A localhost built-server harness also
verified both real POST routes, three captured sends, saved QR attachments, and
replay without duplicate sends. It blocks all external HTTP. Synthetic database
fixtures were removed; captured synthetic mail remains in the local volume.
Production database records, real R2 objects, and live email delivery were untouched.

Staff APIs are next. Intake stays disabled by default.
