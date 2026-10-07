# CRM core flow plan

Status: draft implementation plan, updated October 6, 2026. The current implementation
focus is the Portal API. Accepted scope, verified facts, and proposed technical
details are separated below. All five policy defaults were confirmed on October
6, 2026. Drafting this plan does not authorize a live migration, deployment, or
email send.

## Agreed scope

- Build CRM functionality in the existing portal repository (`portal/`). The public
  site lives in a separate repository (`web/`). Bryan confirmed this placement
  after identifying both repositories; it supersedes the earlier frontend-repo
  placement answer.
- Deliver the core workshop registration/payment-status flow and basic corporate
  lead capture first, rather than the full FSD lifecycle.
- Ced owns the public frontend and its integration with the API. The current
  change implements Portal APIs and supplies Ced their contract; public frontend
  edits and portal dashboard UI are deferred.
- Record workshop submissions in the admin view and send registrants the initial
  payment-instructions email containing Ding's payment QR.
- Each scheduled workshop has its own admin registration list; repeated dates of
  the same workshop do not share a combined registration list.
- Staff coordinate with registrants and handle payment evidence outside the
  system. CRM records payment status; no proof upload or inbound-email capture.
- One accepted registration reserves one seat immediately. Active Unpaid and
  Paid registrations count against capacity. Staff manually cancel unpaid
  registrations to release seats; there is no automatic 48-hour expiry.
- Keep one active registration per normalized email and scheduled session.
  Duplicate submissions do not reserve another seat, overwrite contact details,
  or resend payment instructions.
- After saving a corporate inquiry, send the requester an acknowledgment and
  send the team an internal notification. Corporate inquiries receive no payment
  instructions.
- Payment statuses are Unpaid and Paid. Permit Unpaid → Paid; require a reason
  for Paid → Unpaid. Preserve actor, time, old/new status, and reason. Repeated
  identical changes are no-ops.
- Staff access requires an authenticated, verified Google identity whose
  normalized email is in `ADMIN_EMAILS`, checked on every CRM request.
  Database-allowed portal users do not automatically gain CRM access.
- Consume the workshop catalogue maintained by Ced; defer workshop create/edit
  functionality in the CRM.
- Payment-status changes only update the CRM; no automated paid-confirmation
  email. The initial QR payment-instructions email remains in scope.
- Reuse the existing PostgreSQL database. Its connection and table metadata were
  verified through a read-only inspection; no customer records were read.

The accepted placement and payment assumptions are recorded below.

## Verified baseline and integration constraints

The public site's `crm/integration` branch initially matched local `main` at
`ee0f0a5`. That checkout has no implemented CRM, database integration,
authenticated dashboard, or email sending. The site uses Next.js, React Hook
Form, and Zod; both public submissions currently save confirmation-display data
to session storage and navigate to a success page.

The separate portal uses TanStack Start, Better Auth with Google sign-in, Drizzle,
and PostgreSQL. The current local branch is based on the auth-only `main` schema.
The open [Content CMS PR #1](https://github.com/iridel-co/adrian-ding-portal/pull/1)
contains the catalogue schema, migrations, and feature services. Its migration
defines the same twelve content tables observed in the database. This explains
the local-branch gap; it does not prove who applied the SQL or that the migration
ledger matches. The only existing HTTP API route on the local branch is authentication.

## CMS foundation and module convention

PR #1 was inspected on October 5, 2026, at head
`8e66ff63ec6d71cdcb10c5d354ddc4f6cdb03d15`; it was open against `main`.
Bryan confirmed on October 6, 2026, that CRM will use a stacked PR: branch from
PR #1's branch and initially target the CRM PR at that branch. After PR #1 merges,
retarget the CRM PR to `main` and rebase if needed. Verify the current CMS head
before branching. This plan does not merge the PR or apply its migrations.

The PR establishes a feature convention under `src/features/<name>/`:

- `schemas.ts`: Zod inputs and normalization.
- `service.ts`: server-only operations receiving the database/transaction,
  validated data, and an actor for staff mutations; business rules and auditing
  live here.
- `functions.ts`: thin authenticated TanStack server-function wrappers and query
  options for internal Portal screens. Add CRM wrappers when a screen needs them;
  the current HTTP API phase need not scaffold unused wrappers.
- Public HTTP routes are another thin adapter to the same service operations.
  They must not duplicate business rules or expose authenticated CMS queries.

Use this convention instead of the earlier proposed loose `src/lib/crm*.ts`
layout. Reuse the PR's shared actor/database types, audit, field, and time helpers
where their semantics match. The module convention is documented in the PR
description and demonstrated in its feature code, rather than a general module
guide on the current `main` branch.

Verified integration points include
[session service wrappers](https://github.com/iridel-co/adrian-ding-portal/blob/8e66ff63ec6d71cdcb10c5d354ddc4f6cdb03d15/src/features/sessions/functions.ts),
[shared audit functions](https://github.com/iridel-co/adrian-ding-portal/blob/8e66ff63ec6d71cdcb10c5d354ddc4f6cdb03d15/src/features/shared/audit.ts),
[public media URL resolution](https://github.com/iridel-co/adrian-ding-portal/blob/8e66ff63ec6d71cdcb10c5d354ddc4f6cdb03d15/src/features/media/r2.ts),
and the
[course-code lock hook](https://github.com/iridel-co/adrian-ding-portal/blob/8e66ff63ec6d71cdcb10c5d354ddc4f6cdb03d15/src/features/workshops/course-code-lock.ts).

## Public-site integration constraints

- Workshop fields: name, email, phone, occupation, salary range, optional city,
  and consent. Its display handoff preserves only slug, name, email, and phone.
- Corporate fields: name, email, phone, company, role, programme, attendee band,
  target date, venue, context, consent, and additional programmes. Its display
  handoff drops phone, role, context, and consent.
- The API submission payload must account for every collected field; the existing
  display handoff is not that payload. Agree the payload with Ced without editing
  the public frontend as part of this work.
- Workshop prices and capacity are demo data. Programme values are titles and
  target dates are composed strings. Stable identifiers and authoritative
  workshop data need a contract before accepting real registrations.
- Existing lead-capture requirements say save the record before sending email.
  A failed write must not show success; email failure must preserve the record.
  Error responses, retries, and duplicate behavior still need agreement.
- Resend is a documented provider choice, with no installed send wiring. Real
  QR/account data, sender-domain ownership, and recipients remain dependencies.
- Existing public copy promises a 48-hour hold and a second payment-confirmation
  email. Ced owns reconciling that copy with the agreed API behavior; the copy does
  not silently expand the first-release backend scope.

Sources: README flows (`web/README.md#form-flows-emails--crm-triggers` in the website repository),
workshop form (`web/src/app/workshops/[slug]/_sections/registration-form.tsx` in the website repository),
corporate form (`web/src/app/corporate-training/_sections/inquiry-form.tsx` in the website repository),
display handoff (`web/src/app/_lib/handoff.ts` in the website repository),
draft FSD (`web/docs/product/FSD.md` in the website repository),
[portal schema](../../src/db/schema/index.ts), and
[portal authentication](../../src/lib/auth.ts).

## Existing database evidence

Read-only table, column, relationship, and enum metadata was inspected on
October 5, 2026. Connection details and customer data are excluded from this plan.

- `workshop` holds catalogue content; `workshop_session` holds each scheduled
  offering, with date/time, integer-centavo price, capacity, registration cutoff,
  and draft/open/closed/cancelled status. Registrations should reference the
  existing session ID, with Ced agreeing how the public form supplies it.
- `payment_account` already links payment destinations to QR media. Verify which
  active account supplies Ding's QR rather than introducing duplicate settings.
- `activity_log` stores actor, action, entity, changes, and time. Inspect its
  retention before rollout. PR #1 supplies its mapping and a `logActivity`
  helper that accepts a transaction; reuse these for staff payment changes.
- The portal's Better Auth code uses the existing auth tables and Google sign-in.
  Reuse that integration; live sign-in has not been verified during planning.
- The portal currently permits sign-in through either the `ADMIN_EMAILS`
  environment allowlist or the `allowed_email` table. Bryan selected an
  environment allowlist for CRM and confirmed on October 6, 2026, that only
  verified Google identities in `ADMIN_EMAILS` receive CRM access.
- No registration or corporate inquiry table was visible. `client` is shaped
  as a client-logo catalogue, not an inquiry store. Additive CRM schema changes
  should extend PR #1's schema and migration history, preserving its catalogue.

## Policy decisions

On October 6, 2026, Bryan confirmed all five defaults as implementation
assumptions: seat reservation, duplicate registration, corporate emails, CRM
staff permissions, and payment correction.

| Choice | Status | Behavior |
| --- | --- | --- |
| Q12: seat reservation | Confirmed | One accepted registration reserves one seat immediately. Count active Unpaid and Paid registrations against capacity. Staff manually cancel unpaid registrations to release seats. No automatic 48-hour expiry. |
| Q13: duplicate registration | Confirmed | One active registration per normalized email and scheduled session. Retries do not create records or send payment instructions again. |
| Q14: corporate emails | Confirmed | Send requester acknowledgment and an internal notification after saving. Corporate inquiries do not receive payment instructions. |
| CRM staff permissions | Confirmed | Require an authenticated, verified Google identity whose normalized email is in the existing `ADMIN_EMAILS` environment variable, checked on every CRM request. Database-allowed portal users do not automatically gain CRM access. |
| Payment correction | Confirmed | Permit Unpaid → Paid; require a reason for Paid → Unpaid. Preserve the actor, time, old/new status, and reason. Treat repeated identical changes as no-ops. |

Q15 is resolved: `portal/` contains the authentication and migration setup. The
catalogue mappings and feature-module pattern are supplied by open PR #1. Verify
its migration ledger before rollout; no separate catalogue reimplementation is needed.

## Proposed API contract

Use TanStack Start HTTP server routes, following the existing authentication
route's structure. Public endpoints accept submissions without staff sign-in.
Staff endpoints use the existing Better Auth session plus the CRM allowlist
check. API names below are proposed; publish the final contract for Ced when
implementation is verified.

| Method and path                                  | Access | Purpose                                                                                                                                                                          |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/registrations`                        | Public | Capture one workshop registration and queue its payment email.                                                                                                                   |
| `POST /api/corporate-inquiries`                  | Public | Capture a corporate lead and queue the requester acknowledgment and internal notification.                                                                                      |
| `GET /api/workshop-sessions?slug=…`              | Public | Supply published, open, eligible scheduled session IDs and authoritative price/availability for Ced's integration. Reuse an existing catalogue API instead if one is identified. |
| `GET /api/crm/registrations?workshopSessionId=…` | Staff  | List registrations for one scheduled workshop, including payment and email state.                                                                                                |
| `GET /api/crm/registrations/:id`                 | Staff  | Read one registration, its change history, and email-job IDs.                                                                                                                    |
| `PATCH /api/crm/registrations/:id/payment`       | Staff  | Record payment status with an expected current status to reject stale edits.                                                                                                     |
| `POST /api/crm/registrations/:id/cancel`         | Staff  | Cancel an unpaid registration with a reason and release its seat.                                                                                                                |
| `GET /api/crm/corporate-inquiries`               | Staff  | List corporate leads and associated email state/job IDs.                                                                                                                         |
| `POST /api/crm/emails/:id/retry`                 | Staff  | Retry an eligible unsent email without creating another submission.                                                                                                              |

### Public requests and responses

- Workshop body: `workshopSessionId`, `fullName`, `email`, `phone`, `occupation`,
  `salaryRange`, optional `city`, and `consent: true`.
- Corporate body: `fullName`, `email`, `phone`, `company`, `role`, `program`,
  `attendees`, `targetDate`, `venue`, optional `context`, `consent: true`, and
  optional `alsoInterested`. Preserve the site's current programme titles and
  target-date description for lead capture; do not require a form redesign.
- Both require a random UUID v4 `Idempotency-Key` header generated once per intended
  submission and reused on retries. Store a hash of the normalized accepted
  payload; reuse of a key with a different payload returns `409`.
- Validate with the installed Zod dependency, normalize email, reject unknown
  fields, bound field lengths and array sizes, and limit actual body bytes.
  Price, payment status, QR destination, and seat quantity are server-controlled.
- Return `202` with `{ "accepted": true }` only after persistence commits. Use
  the same acknowledgment for an existing active registration submitted with a
  different key; disclose no existing registration ID or attendee information.
  The registration reference goes to its email recipient, not an email lookup API.
- A duplicate never overwrites contact details or requeues an email. Corporate
  inquiries deduplicate retries by key; a new key may represent a new inquiry
  from the same email.
- Return structured errors with a stable code and optional field errors:
  malformed JSON/validation `400`, unsupported content type `415`, oversized
  body `413`, unavailable/full session or key mismatch `409`, intake throttling
  `429`, and unavailable dependencies/configuration `503`. Do not expose SQL,
  credentials, provider responses, or customer data.
- A failed save never returns an accepted acknowledgment. A failed email send
  after commit preserves the record and a recoverable delivery job; acceptance
  means the record was saved, not that the email reached the inbox.

The public input schemas were implemented and tested on October 6, 2026, in
`portal/src/features/crm/schemas.ts`. Both reject unknown fields, require literal
boolean consent, trim text, and lowercase emails. Registration session IDs and
the separate UUID v4 request key are canonicalized to lowercase. Omitted or blank
city/context values become `null`; omitted additional programmes become `[]`.
Programme titles, salary ranges, attendee bands, and preferred-date descriptions
remain bounded text rather than lists copied from frontend demo data.

| Field | Limit after trimming |
| --- | --- |
| Email | 254 characters and valid email syntax |
| Phone | 40 characters, 7–15 digits, optional leading `+`, and common formatting separators |
| Name, occupation, city, company, role, programme, preferred date, each additional programme | 200 characters |
| Salary range, attendee band | 100 characters |
| Venue | 300 characters |
| Context | 5,000 characters |
| Additional programmes | 20 entries, each nonblank |

Required names, occupation, company, role, preferred date, and venue have a
two-character minimum. Salary range, programme, and attendee band have a
one-character minimum. Byte limits, JSON parsing, and HTTP error responses belong
to the upcoming route handlers; these schemas do not read requests or save data.

### Browser and staff request boundaries

Configure exact website origins and handle public `OPTIONS` preflight for JSON
and `Idempotency-Key`. Return `Vary: Origin` and no shared-cacheable submission
responses. Do not require browser credentials or place a secret API key in web.
CORS permits the browser connection; it is not authentication or spam protection.

Staff reads return only to authenticated, environment-allowlisted staff and use
bounded pagination. Staff mutations additionally enforce the portal's own
origin/CSRF boundary. Test an existing session belonging to a removed or merely
database-allowed user; sign-in alone is insufficient authorization.

## Data and migration changes

Add only the CRM data needed for this flow:

- `registration`: UUID reference, scheduled session ID, all captured fields,
  normalized email, consent timestamp, authoritative price snapshot in centavos,
  Unpaid/Paid status, cancellation metadata, timestamps, and idempotency key/hash.
  Enforce a unique active email/session pair in PostgreSQL, alongside a unique
  submission key. Cancellation is separate from payment status.
- `corporate_inquiry`: UUID reference, all captured corporate fields, consent
  timestamp, timestamps, and unique submission key/hash. Do not repurpose the
  client-logo table or add a sales lifecycle.
- `crm_email_job`: linked registration/inquiry, message kind, immutable message
  payload, delivery state, attempt times, provider ID, and a safe error code.
  Persist the job in the same transaction as the submission.
- `crm_submission_key`: each accepted key and normalized-payload hash, linked to
  exactly one registration or inquiry. A duplicate signup with a fresh key must
  remember that key without overwriting the original signup or creating email.
- Reuse PR #1's `activity_log` and `logActivity(tx, entry)` for staff payment and
  cancellation history, in the same transaction as the change. Its actor foreign
  key uses `ON DELETE SET NULL`; preserve an identity snapshot in its typed
  change data so the audit remains understandable after account removal. Verify
  retention rather than adding a duplicate CRM history system by default.

Base the CRM migration on PR #1's catalogue mappings and latest snapshot. Produce
a reviewed additive diff containing only CRM structures and required foreign
keys/indexes, then test it after the CMS migrations in an isolated database.
`drizzle-kit generate` compares local schema snapshots; it does not automatically
delete database tables missing from a local definition. `migrate` applies pending
SQL. The earlier uncertainty was the missing PR context, not a need to rebuild or
adopt an unknown catalogue. Verify the existing migration ledger before rollout;
do not recreate the CMS tables or blindly mark migrations applied.

### Registration transaction

1. Validate input and check an existing submission key for replay/mismatch.
2. Lock the workshop for sharing, then the scheduled session for update. Check published workshop, open session,
   registration cutoff, and whether its start has passed in `Asia/Manila`.
3. Check for an active same-email registration before counting remaining capacity.
4. Count active registrations while holding the session lock; reject when full.
5. Insert the Unpaid registration and its immutable payment-email job, then commit.
6. Attempt email delivery after commit; never hold the seat transaction open for
   a network request.

Cancellation must follow the same workshop-first, then session lock order,
record its reason/history, and release the seat atomically. Concurrent requests for the last seat must
produce exactly one accepted registration. A retry of a cancelled registration
does not reopen it; a deliberate fresh registration uses a new key and current
availability checks.

Implement PR #1's `isCourseCodeLocked(db, workshopId)` hook, which currently
returns false, using the agreed active-registration definition. Verify it through
the workshop update service. Coordinate lock order with CMS mutations so a
concurrent registration and course-code change cannot bypass the rule. Also
guard CMS capacity reductions below the active
registration count; this is a cross-feature consistency check, not a workshop
editing feature in CRM.

## Payment QR and email delivery

Reuse the existing `payment_account` → `media` relationship. Select Ding's account
explicitly through configuration; verify it is active and its QR media is usable.
The media table stores a storage key rather than a public URL. Reuse PR #1's
`publicMediaUrl(key)` and existing `R2_PUBLIC_BASE_URL` configuration instead of
introducing another media-base setting. Verify the configured URL resolves Ding's
QR. Never accept a payment destination or attachment URL from the public form.

Use Resend's HTTP API through native `fetch`, without adding a mail framework or
SDK. Include the registration reference, workshop/date, authoritative amount,
payment-account details, and QR in the initial message. Include a QR attachment
when supported by the confirmed media configuration. Staff handle payment proof
and follow-up outside the system. Payment-status changes send no email.

Persist each complete message before sending so retries use the same payload and
provider idempotency key. Await a bounded initial send attempt after commit; do
not rely on an unawaited task surviving a serverless request. Record provider
acceptance as sent-to-provider, not proof of inbox delivery.

Claim retry work atomically to avoid simultaneous sends. Recover interrupted
attempts within the provider's idempotency retention window; outside that window,
an ambiguous result requires reconciliation rather than a blind resend. Staff
can inspect delivery state through the CRM APIs and retry eligible jobs. Skip
obsolete payment instructions when a registration is already paid or cancelled
before dispatch. Defer scheduled workers, reminders, and inbound email parsing.

Provider references: [send email](https://resend.com/docs/api-reference/emails/send-email)
and [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).

### Configuration and launch dependencies

Keep secrets in Portal. Proposed additions to the existing environment parser
and `.env.example`:

- `SITE_ORIGINS`: exact site origins, including separately configured local and
  preview environments.
- `PAYMENT_ACCOUNT_ID`: the existing account containing Ding's payment QR.
- `RESEND_API_KEY`, `EMAIL_FROM`, and `EMAIL_REPLY_TO`.
- `CORPORATE_INQUIRY_RECIPIENTS`: configured team recipients for internal notifications.

Reuse `ADMIN_EMAILS`, `DATABASE_URL`, and the CMS media configuration. Validate integration readiness before
accepting real submissions; missing required settings must produce a clear
unavailable response, not a success without the intended workflow. Verify the
sender domain, QR rendering, recipient ownership, and deployed database schema
in a non-production environment. Add edge request/body limits and durable abuse
protection before exposing public intake; choose the deployed platform's native
facility rather than a process-local limiter that resets across instances.

## Implementation sequence and files

1. **CMS foundation and contract:** base the work on PR #1's schema/services and
   module convention; add CRM schema/migration and input schemas, and establish
   the public request/idempotency contract.
2. **Public intake:** implement both POST routes, transactional reservation,
   duplicate behavior, generic responses, and exact-origin CORS. Add the small
   session lookup only if needed to supply Ced's session IDs.
3. **Payment email:** add durable email jobs, configured QR resolution, bounded
   Resend sending, and recovery. Include corporate acknowledgment and internal
   notification email kinds.
4. **Staff API:** implement list/detail, payment changes/history, unpaid
   cancellation, and email retry under the per-request CRM authorization check.
5. **Verify and hand off:** complete isolated integration tests, typecheck/build,
   and a tested request/response guide for Ced. Reconcile his site copy before
   a real registration release.

Expected Portal changes are a CRM schema file/export under `src/db/schema/`, a
reviewed migration under `drizzle/`, `src/features/crm/schemas.ts`, `service.ts`,
and `email.ts`, thin HTTP routes under `src/routes/api/`, the existing course-code
lock hook, the environment parser/example, and API documentation. Use the CMS
PR's shared utilities and Vitest setup for meaningful checks; retain the existing
request-scoped database convention. Add internal `functions.ts` wrappers only
when the Portal UI needs them. Avoid a generic repository layer, queue framework,
second auth service, or changes to `web/`.

Step 1 setup was completed on October 6, 2026: the local stacked branch
`codex/crm-api-stacked` uses the verified CMS head
`45a296da24e18e611991590dde6c3c7cf75bcf26`. An isolated PostgreSQL database with
the three CMS migrations and a local mail capture transport are ready. The CMS
baseline passed 54 tests and typecheck. See [the setup record](CRM-SETUP.md) for
local service commands and verification limits. At Bryan's request, the test
services now use `portal/compose.yaml` for start, stop, status, and logs. No CRM
application code was changed during setup.

The database schema was implemented on October 6, 2026, in
`portal/src/db/schema/crm.ts`, with exports and relations integrated into the CMS
schema. Migration `20261006140302_crm_core` adds registration, corporate inquiry,
and email job tables, three CRM enums, foreign keys, indexes, and checks. Its
CRM-specific trigger prevents changes to a saved email's identity or payload.
Existing audit history remains in `activity_log`.

The migration was applied only to the Docker test database, which now has four
migrations and 20 public tables. The runnable check
`node --env-file=.env.crm-test scripts/dev/check-crm-schema.mjs` verifies existing
CMS columns and synthetic records, captured fields, concurrent duplicate
registrations, submission-key uniqueness, cancellation, consent, email ownership
and immutability, valid delivery state, and transaction rollback. It cleans up
its synthetic records. The 54 existing tests, typecheck, production build, and
schema/snapshot consistency check passed. Public request validation was then
implemented in `src/features/crm/schemas.ts`; its eight boundary tests passed
alongside the existing suite, for 62 tests total, and typecheck passed.

Public intake services and the two POST/OPTIONS route handlers were then
implemented. Both save the submission and immutable pending email jobs together;
actual email sending remains the next step. Intake defaults to disabled through
`CRM_INTAKE_ENABLED=false` until delivery and platform abuse controls are ready.

Migration `20261006150228_crm_submission_keys` adds accepted-key receipts so a
fresh key for an existing registration is also remembered. Workshop share locks
coordinate course-code edits; session update locks prevent seat oversubscription
and capacity reductions below the active count. The CMS course-code hook now
checks active registrations. Existing schemas and validation limits are unchanged.
The request byte cap is 64 KiB, with a five-second body read timeout. These are
implementation defaults rather than approved business thresholds.

The guarded intake check verifies persistence, retry/mismatch behavior, pending
email ownership, concurrent last-seat and duplicate submissions, cancellation
replay, rollback on job storage failure, corporate fields, and actual CMS update
services including concurrent edits. The test database has five migrations and
21 public tables. See [the request contract](CRM-API.md) for payloads and the
remaining session-lookup/frontend integration work.

## Verification and completion criteria

Use an isolated local/test PostgreSQL database and a controlled mail transport;
do not run test writes or provider sends against the supplied live connection.
Keep one runnable integration check covering the consequential behavior:

- Valid workshop/corporate submissions preserve every field and consent.
- Invalid, oversized, forged-price/status, and unconsented payloads are rejected.
- Unknown, unpublished, closed, past, cutoff-expired, and full sessions reject
  registrations without creating a record or mail job.
- Concurrent last-seat requests, duplicate emails, exact retries, and conflicting
  key reuse enforce the selected capacity and idempotency rules.
- CMS edits respect CRM registrations: course-code locking and capacity
  reductions remain safe under concurrent mutations.
- Database failure rolls back both record and mail job; provider failure leaves
  the committed record recoverable. Concurrent retries and interrupted sends do
  not emit duplicate messages within the documented safe recovery window.
- Anonymous, non-allowlisted, revoked, and CSRF requests cannot read or change
  CRM data. Status edits/cancellation preserve actor/time/history atomically.
- The additive migration preserves existing auth/catalogue tables and their
  records. Tests seed synthetic catalogue data, not copied customer rows.
- Portal typecheck and production build pass. HTTP smoke checks cover the actual
  routes, error responses, allowed/blocked origins, and preflight behavior.

The local change is complete when those checks pass and Ced has an accurate
contract. Deployment remains a separate step. Before real intake, verify the
configuration, abuse protection, test-environment provider
delivery, and Ced's success/error behavior. Stop rollout on lost fields,
overselling, duplicate sends, unauthorized access, or a destructive migration.

Measure API and provider timing during verification; report database/provider
requests and observed mail cost without claiming production cost or latency from
local tests. No real submission should be accepted until the agreed flow has been
verified across the deployed site and Portal.

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
