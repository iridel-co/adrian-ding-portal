# Workshop registration data layer

Date: October 16, 2026, Asia/Manila
Branch: `crm/workshop-registration-flow`
Status: step 1 implemented and locally verified; no push or deployment.

## Result

The existing Portal schema now supports workshop registrations without replacing
the corporate inquiry foundation. The new additive migration is
`drizzle/20261016132854_workshop_registration/migration.sql`, with its generated
snapshot. Existing migrations were not edited.

`registration` stores the scheduled session link, submitted contact/demographic
answers, consent timestamp, immutable human reference and saved price in centavos.
Payment is Unpaid or Paid; cancellation is recorded separately with staff identity,
time and reason. An active registration is any record without cancellation,
regardless of payment status. A partial unique index permits only one active
normalized email per scheduled session. A cancelled person may register again
with a new reference.

Paid records require a payment method, nonnegative amount, nonblank payer name
and provider transaction reference, verification time and verifier. The last
verification can remain on an Unpaid record after correction; later staff APIs
will write the correction reason and full change history to the existing activity
log. Paid records cannot be cancelled directly. Foreign keys restrict deletion
of referenced sessions and payment/cancellation staff records.

## References and existing callers

`registration_reference_counter` keeps one counter per course code. Keeping the
counter under the code also prevents reusing issued numbers if that code is
assigned again after its old registrations are cancelled.
`allocateRegistrationReference` atomically increments it inside the caller's
transaction and returns `AD-<COURSE>-<####>`. Numbers grow beyond four digits
without truncation. A failed registration transaction rolls back the allocation.
A database trigger prevents editing an issued registration reference.

The existing course-code guard now checks active registrations across every
session of the workshop. Workshop edits lock the parent row, establishing the
workshop-first lock order required by the later intake transaction. After all
registrations are cancelled, a course-code edit is allowed while historical
references remain unchanged.

## Shared CRM storage

Request-key receipts and email jobs may belong to either one inquiry or one
registration. Database checks forbid missing or dual ownership. Email kinds must
match their owner, and each registration can have only one payment-instructions
job and one payment-acknowledgment job. Existing corporate kinds and their
uniqueness/recovery behavior are retained. Schema exports and relations support
the new registration, session, job and receipt links.

Original registration request keys remain on the registration. Additional keys
for duplicate submissions can link to that record without overwriting its
original key or accepted answers. When implementing intake, only the original
creation key may recover the reference/status result; replaying a separate
duplicate key must keep its generic response. Matching payload hashes alone must
not turn a duplicate receipt into permission to reveal the original record.

The current email worker remains corporate-only and ignores registration-owned
jobs. The corporate scheduler already filters by inquiry ownership. No workshop
message templates, delivery entrypoints, intake routes or staff actions were added.

## Verification

- All 225 tests passed: 195 unit tests and 30 isolated database checks.
- Seven added database tests cover concurrent references across runs, separate
  courses, five-digit numbering, rollback, duplicate email races, cancellation
  without reference reuse, saved answers/price, immutable references, foreign keys,
  payment/cancellation constraints, course-code edits, owner rules, duplicate
  receipts and unique email jobs. Registration jobs remain unclaimed by corporate
  delivery; relational queries retrieve the session and jobs.
- Migration setup applies all migrations to a clean temporary database, upgrades
  the prior CMS baseline and upgrades the corporate baseline with saved inquiry,
  receipt and message snapshots. Existing records survive; applying migrations
  again creates no additional ledger entries.
- Type checking, production build and whitespace checks passed. The build emitted
  third-party module-directive warnings and completed successfully.

Database checks use only the explicitly selected local Compose server and create
and remove temporary databases. They never use the application's `DATABASE_URL`.
Only synthetic records and fake mail transports were used; no live provider was
called. The application database was not migrated. Test databases were removed,
and the local Postgres service was stopped with its volume preserved.

## Remaining work

Steps 2–6 remain. The tables are not a public registration endpoint or a complete
payment workflow. Capacity allocation, request validation and replay responses,
atomic record/receipt/email creation, staff action authorization/auditing and
E1/E2 delivery will be implemented in those steps. In particular, the schema's
duplicate index does not replace the session capacity lock required at intake.

No website files, Portal screens, production database, live email settings or
deployment configuration changed. No browser/device or live Google/provider
verification was run for this data-layer step.
