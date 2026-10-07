# CRM API contract

Implemented locally on October 6, 2026, with email delivery added on October 7.
These endpoints save submissions and immutable messages together, then await
bounded delivery attempts after commit. `CRM_INTAKE_ENABLED` defaults to `false`.
Do not enable real intake until delivery, QR verification, and the deployment's
native request limits and durable abuse protection are ready.

## Requests

`POST /api/registrations` accepts this JSON body:

```json
{
  "workshopSessionId": "12345678-abcd-4000-8000-123456789abc",
  "fullName": "Maria Santos",
  "email": "maria@example.com",
  "phone": "+63 (917) 123-4567",
  "occupation": "Engineer",
  "salaryRange": "Prefer not to say",
  "city": "Cebu City",
  "consent": true
}
```

The session ID must identify an existing open session of a published workshop.
Registration stops at its cutoff or its start in Asia/Manila. `city` is optional;
omission or a blank string becomes null. Explicit input null is rejected.
The authoritative price comes from that session, and new registrations are unpaid.

`POST /api/corporate-inquiries` accepts:

```json
{
  "fullName": "Maria Santos",
  "email": "maria@example.com",
  "phone": "+63 (917) 123-4567",
  "company": "Example Co",
  "role": "HR Manager",
  "program": "Help us scope it",
  "attendees": "16 to 30",
  "targetDate": "Q1 2027, flexible",
  "venue": "Our Cebu office",
  "context": "Training for our new managers",
  "alsoInterested": ["Leadership", "Communication"],
  "consent": true
}
```

`context` and `alsoInterested` are optional. Context omission or a blank string
becomes null; the list defaults to an empty array. Programme and date descriptions
remain text. The exact validation limits are recorded in CRM-PLAN.md.

Both requests require `Content-Type: application/json` and an `Idempotency-Key`
header containing a random UUID version 4. Generate that key once per intended
submission with `crypto.randomUUID()` and reuse it on retries. It is not a JSON
body field. No cookie, browser credentials, or secret API key is needed.

The body limit is 64 KiB of actual streamed bytes, regardless of Content-Length.
This is an implementation default, separate from text length limits. Reading the
body has a five-second timeout. Unknown fields cause rejection; clients must not
send a price, quantity, QR URL, payment status, or consent timestamp.

## Responses and retries

A committed save returns `202` with exactly:

```json
{ "accepted": true }
```

This response means the record and its pending email jobs were saved. It does not
prove email delivery. Responses disclose no registration IDs or contact details.

- The same key and normalized answers return the same acknowledgment, including
  after a session closes or its registration is cancelled. This never recreates
  a cancelled registration.
- The same accepted key with different normalized answers returns `409`. Keys
  are shared across both endpoint types; reusing one across the types also fails.
- A fresh key for an active same-email/session registration returns the same
  acknowledgment when the session is still eligible, without overwriting details,
  taking another seat, or adding an email. That fresh key and its accepted answer
  hash are remembered too.
- A cancelled registration releases its seat. A deliberate fresh registration
  uses a new key and passes current session and capacity checks.
- Corporate retries deduplicate by key. A fresh key represents a fresh inquiry,
  even when the same email has made an earlier inquiry.

Errors have a safe code, with field paths for body validation failures:

```json
{ "error": { "code": "invalid_submission", "fields": ["email", "consent"] } }
```

| Status | Codes | Meaning |
| --- | --- | --- |
| 400 | invalid_json, invalid_idempotency_key, invalid_submission | Fix the request. |
| 403 | origin_not_allowed, preflight_not_allowed | Origin or preflight is outside the configured contract. |
| 405 | method_not_allowed | The submission handler supports POST and OPTIONS. |
| 408 | request_timeout | Reading the request body took too long. |
| 409 | session_unavailable, idempotency_key_mismatch | Session unavailable/full, or a key was reused with different answers. |
| 413 | body_too_large | The body exceeds 64 KiB. |
| 415 | unsupported_content_type | Send application/json. |
| 503 | intake_unavailable | Intake disabled, incomplete settings, invalid payment/QR setup, or a save failure. |

Platform throttling and its 429 response remain launch work. CORS does not stop
non-browser clients from sending requests.

## Website origins

`SITE_ORIGINS` contains exact HTTP(S) origins, comma-separated, without a trailing
slash or path. Each endpoint supports OPTIONS for POST with Content-Type and
Idempotency-Key. Approved browser origins receive Access-Control-Allow-Origin,
including on errors. Responses use `Vary: Origin` and `Cache-Control: no-store`,
and do not allow browser credentials. Requests without Origin are allowed for
server clients; the validation and database checks still apply.

## Configuration and verification

Settings are documented in `portal/.env.example`. CRM settings are checked only
when these routes run, so an incomplete CRM setup does not disable the CMS.
The explicitly configured payment account must be active and have active PNG,
JPEG, or WebP QR media with positive size and a usable storage key. The message
uses the existing publicMediaUrl helper and R2 settings, and requires an HTTPS
URL. Launch verification must still confirm that the public URL resolves the intended QR.
New registration intake reads the configured R2 QR object before its final save.
A failed read rejects the request without a registration. The message stores its
base64 attachment, so retries use the same bytes. The existing publicMediaUrl
helper still supplies the image URL. No database lock is held during the R2 read
or provider call; eligibility, capacity, and media metadata are checked again
before the final save. QR attachments have a 1 MiB bound, a five-second read
timeout, and size, MIME type, and image-signature checks. The size bound is an
implementation default.

All accepted keys live in `crm_submission_key`. The original key remains on the
registration or inquiry. A key lock prevents competing transactions from using
one key; a workshop share lock coordinates course-code edits, and a session
update lock serializes seat checks. Unpaid and paid active registrations both
count toward capacity. CMS edits cannot change a course code while it has active
registrations, or reduce session capacity below the active count.

From `portal/`, with Docker Compose running:

```sh
node --env-file=.env.crm-test scripts/dev/check-crm-intake.mjs
pnpm test
pnpm typecheck
pnpm build
```

The integration check accepts only 127.0.0.1:55432/adrian_ding_crm_test, applies
pending migrations there, and creates and removes synthetic fixtures. It checks
HTTP boundaries, persistence, pending jobs, simultaneous last-seat signups,
concurrent duplicate keys, accepted-key mismatches, cancelled-key replay,
transaction rollback, corporate retries, and concurrent CMS edits. It makes no
provider or R2 calls. Regular unit runs skip database integration unless the
explicit CRM_INTEGRATION_DATABASE_URL is set to that same guarded database.

The website's current confirmation handoff keeps only some answers and supplies a
workshop slug, not a scheduled session ID. Ced must send the full payload above
from the form values. A public session lookup and the final frontend handoff
remain integration work; no public catalogue route was added in this step.

## Email delivery and recovery

A newly saved registration triggers its payment email. A newly saved inquiry
triggers requester acknowledgment and team notification. Public retries and
fresh-key duplicate registrations never trigger another send. Provider failure
after commit still returns 202, preserves the record, and leaves a failed job.

The production sender uses native fetch to Resend with a ten-second timeout and
the immutable job UUID as its provider key. HTTP payload fields include reply_to
and base64 attachments. The provider ID and sent time record provider acceptance,
not inbox delivery. Provider error contents never enter public responses or stored
error codes.

The internal sendEmailJob operation claims a job in a transaction with a
60-second lease, then releases the transaction before sending. Another sender
cannot claim an unexpired lease. Expired leases and failed jobs can retry with
the same key and message; an attempt counter prevents a late response from
overwriting a newer attempt. Payment instructions already paid or cancelled
before claim are skipped. Sent, skipped, and reconciliation jobs are terminal.

[Resend retains duplicate-send keys for 24 hours](https://resend.com/docs/dashboard/emails/idempotency-keys).
The implementation uses a conservative 23-hour-59-minute window measured from
the database-recorded first attempt. Attempted jobs beyond that window become
needs_reconciliation and make no provider call, even when the last failure was
a rejection. A failed write after provider acceptance leaves the claim recoverable
with the same key. Staff can use the authenticated retry endpoint below.

Local tests explicitly inject the loopback mail capture transport.
CRM_TEST_EMAIL_URL never redirects production requests. The local capture keeps
synthetic messages in its volume; its process-local duplicate-key memory resets
when the container restarts. No live provider key or R2 object was used in tests.

## Staff endpoints

Every request requires a valid Better Auth session, a currently verified user with
a linked Google account, and an email in the current `ADMIN_EMAILS` environment
setting. Database-only CMS allowlisting does not grant CRM access. The session
cookie cache is bypassed and the current user/account is checked on every request.
Responses use `Cache-Control: no-store`; they expose no stored request hashes,
idempotency keys, or complete email payloads.

These APIs belong to the portal. There is no public-site CORS access. Mutations
require an `Origin` equal to the origin of `BETTER_AUTH_URL`. A missing, `null`,
or other origin is rejected. Cross-site Fetch Metadata requests are rejected.
Reads can omit Origin, but reject another origin when supplied. Browser callers
send the portal session cookie. All mutation bodies are JSON with the same
64 KiB/five-second read bounds as public intake.

| Method | Path | Result |
| --- | --- | --- |
| GET | `/api/crm/registrations?workshopSessionId=<uuid>` | `{ items, hasMore }`, includes paid/unpaid and cancelled registrations for that session |
| GET | `/api/crm/registrations/<uuid>` | Registration fields plus `emailJobs`, `history`, `historyHasMore` |
| PATCH | `/api/crm/registrations/<uuid>/payment` | `{ changed: true }` or `{ changed: false }` |
| POST | `/api/crm/registrations/<uuid>/cancel` | `{ changed: true }` or `{ changed: false }` |
| GET | `/api/crm/corporate-inquiries` | `{ items, hasMore }`, each inquiry includes `emailJobs` |
| POST | `/api/crm/emails/<uuid>/retry` | Current email job metadata after a bounded send attempt |

Lists and detail history accept `limit` from 1 to 100, default 50, and `offset`
from 0 to 100,000, default 0. These are implementation bounds. Rows sort newest
first, with UUID as a stable tie-breaker. Detail pagination applies to history;
email jobs are always included. Unknown query parameters are rejected. An empty
session list is returned when its UUID has no registrations.

Payment example:

```json
{ "paymentStatus": "paid", "expectedPaymentStatus": "unpaid" }
```

Paid-to-Unpaid example:

```json
{ "paymentStatus": "unpaid", "expectedPaymentStatus": "paid", "reason": "Payment was recorded against the wrong registration." }
```

A reason is required for Paid-to-Unpaid. Optional reasons and cancellation reasons
are trimmed nonblank text, at most 2,000 characters. A repeated desired status is
a no-op. Otherwise a mismatched expected status returns `409 payment_status_changed`.
Payment changes on a cancelled registration return `409 registration_cancelled`.
No payment-status email is sent.

Cancellation body:

```json
{ "reason": "Registrant declined to proceed." }
```

Only Unpaid registrations can be cancelled; Paid returns
`409 paid_registration_cannot_cancel`. Repeated cancellation is a no-op and keeps
the original reason/history. Cancellation locks the workshop, session, and
registration in that order, records history, and releases the seat atomically.
Payment edits use the same lock order. Failed history writes roll back the change.
Audit entries preserve old/new values, reason, staff ID/name/email, and time even
after the staff account is deleted.

Paying or cancelling skips pending/failed payment-instruction jobs. A send already
claimed by another request may already be with the provider; its result remains
recordable. Reverting payment does not requeue skipped instructions.

Retry body is `{}`. The response includes job `state`, attempt times/count,
provider ID, and safe error code. `200` reports the resulting job state, including
`failed`; it does not promise delivery. Sent/skipped/reconciliation jobs and
unexpired sending leases are no-ops. Expired attempts use the existing recovery
window and immutable message/key. A missing provider key returns
`503 email_unavailable`. Retry does not require public intake to be enabled.

Staff errors use `{ "error": { "code": "..." } }`: `401 authentication_required`,
`403 staff_access_required` or `origin_not_allowed`, `400 invalid_request` or
`invalid_id`, `404 registration_not_found`, `email_job_not_found`, or
`route_not_found`, the `409` conflicts above, and `503 crm_unavailable` for
unexpected dependency/configuration failures. Body errors reuse the public
`400`/`408`/`413`/`415` codes. Only authenticated staff receive customer records.
