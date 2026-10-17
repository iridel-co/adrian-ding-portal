# Workshop registration scan and implementation plan

Initial scan: October 13, 2026, Asia/Manila
Updated: October 16, 2026, Asia/Manila
Status: adaptive interview complete; step 1 implemented and locally verified.
Steps 2–6 remain. See [step 1 review](STEP-1-REVIEW.md).
The user selected scan and plan first on October 13.

Source: [live Functional Specifications Document](https://docs.google.com/document/d/1SSRLpVXrg93FO47jd8EzcCbsRFtlrxT7zUn6Ni9T1xs/edit).
Read the registration flows 1–8, registration and attendance state models,
CRM operations, email registry, decision log, open decisions, and exclusions.
The document mixes specified behavior, proposed behavior, unanswered questions,
and review comments. An item appearing in a flow does not resolve its open policy.

## Goal

Implement backend processing for workshop registration and staff payment
verification in the existing Portal. Payments happen outside the system.
Each registration belongs to one scheduled workshop run, not just a workshop slug.
Reuse the corporate inquiry foundation and the older registration work without
replacing the corporate lifecycle or introducing a separate CRM application.

Confirmed by the user: another developer owns integration into `web/`.
This chat owns request validation, persistence, capacity/duplicate rules, staff
APIs, the two automated emails, backend verification and an API handoff.
Public form, registered-page implementation, navigation and website quality/browser
checks belong to that developer. Portal UI additions are outside this backend plan;
preserve existing callers when backend contracts change.

## Dedicated implementation worktree

Verified October 15, 2026:

- Worktree: `/Users/brytes/Documents/codes/work/iridel/adrian-ding/worktrees/workshop-registration-flow`
- Branch: `crm/workshop-registration-flow`
- Starting HEAD: `898bcbe`, also the current local `main` commit.
- Working tree was clean before adding this plan.
- Corporate inquiry commit `2719f24` is already an ancestor of HEAD, merged via
  `573f035`. The public content API is also present at `898bcbe`.

All workshop implementation, migrations, tests, configuration examples and API
handoff documentation for this chat belong in this worktree. This file is the
canonical plan and will be maintained here. Do not implement in the `portal/`
main checkout or the corporate inquiry worktree. The other developer owns `web/`.
The older CRM branches are read-only references for reusable registration logic.
This plan records the agreed scope; deferred features are excluded.

## Confirmed workshop email scope

Confirmed by the user on October 13: only two automated workshop emails for now.

1. E1 payment information to the customer after successful workshop registration.
2. E2 payment acknowledgment to the customer when staff manually mark them PAID.

Persist the registration or payment change and its email job atomically; send
after commit. Retries must reuse the same job and must not duplicate an accepted
message. Marking an already-PAID record again must not queue another acknowledgment.
A failed email must preserve the saved registration or payment change.
E2 is sent once per registration. Correcting payment back to Unpaid and later
marking Paid again must not send another acknowledgment if E2 was already sent.

All other workshop email automation is deferred, including internal staff alerts,
waitlist confirmation/seat offers, payment reminders, expiry notices, cancellation,
refund, transfer, substitution resends, organizer changes and preparation emails.
This workshop decision does not change the existing corporate inquiry emails.
The interview decisions below define the reduced non-email scope.

## FSD rescan, October 15, 2026

Reread the live document, including its Official doc and inquiry-draft tabs,
registration flows/state models, decision log and open decisions. Drive reports
the last modification as October 12, 2026, 8:38 PM Asia/Manila, before our first
scan. No new workshop requirements or resolved policies were identified against
the recorded scan. Revision listing returned no accessible revisions, so this
is a content review against our notes, not a verified historical text diff.

Interview corrections after the rescan:

- DEC-02 already specifies `AD-<COURSE>-<####>`. The interview subsequently
  confirmed course-wide numbering under OPEN-08. Internal IDs remain UUIDs.
- DEC-04 specifies manual proof upload in the CRM as the baseline. OPEN-03 also
  discusses inbox versus inbound parsing. The subsequent interview explicitly
  reduced this version to inbox-only verification, as recorded below.
- OPEN-05 labels 48-hour holds and reminder timing as proposed. The seat policy
  was unanswered at rescan and has since been resolved in the interview below.
- OPEN-10 was unresolved at rescan; the interview below now confirms sold-out
  rejection. Refund/amendment features were subsequently deferred. Payment
  account details and demographic consent/retention remain launch inputs.
- The FSD still lists a broad workshop email sequence. The user's confirmed
  two-email scope overrides it for this implementation. Backend-only ownership
  and the dedicated workshop worktree also remain unchanged.

## Confirmed interview decisions

1. Unpaid reservations remain active until staff manually cancel them. They
   count against capacity throughout. No automatic expiry, hold deadline, hold
   extension or expiry scheduler in this version. Staff must regularly clear
   abandoned reservations. E1 and the API handoff must not promise a 48-hour
   deadline. This resolves the reservation-duration part of OPEN-05 for this
   version.
2. Full workshops reject new registrations with a clear sold-out response.
   Do not create a registration, waitlist record, receipt for a rejected request,
   or email job. Recheck capacity atomically to protect the final seat. No
   waitlist state, position or seat-offer action in this version. This resolves
   OPEN-10. The API handoff must document the sold-out response for the other
   developer to display.
3. Payment proof stays in the staff email inbox. Staff verify actual receipt of
   funds outside the CRM, then manually mark the registration Paid. Do not add
   proof uploads, private proof storage, inbound email parsing, attachment APIs
   or a PROOF_RECEIVED state. This explicitly reduces the DEC-04 baseline for
   this version. Proof files and their retention remain outside the CRM.
4. Defer refund records, workshop transfers, attendee substitutions and attendance
   tracking. Keep the first version focused on registration, staff payment
   confirmation and unpaid cancellation. Do not add their fields, states, actions
   or endpoints. Their detailed policies and cutoffs do not block this version.
5. Use one registration-reference sequence per reusable course across all its
   scheduled runs. Preserve the FSD format `AD-<COURSE>-<####>`, padding numbers
   to at least four digits. For example, October may have `AD-PSW-0042` and
   November `AD-PSW-0043`. Do not reset numbering for a new run or reuse cancelled
   references. Each registration still links to its specific session UUID;
   internal database IDs remain UUIDs. This resolves OPEN-08.
6. Staff may correct Paid back to Unpaid with a required, nonblank reason. Record
   the actor, time, previous/new payment status and reason atomically. Keep the
   seat reserved and preserve all payment history. Send no email for the
   correction; an acknowledgment already sent cannot be recalled. This is a
   correction of recorded verification, not a refund. Reject stale conflicting
   changes; repeated identical actions must not duplicate history or jobs.
7. Send only one payment acknowledgment per registration. A later Paid transition
   after correction must not create another E2 message if the original was
   accepted by the provider. Failed delivery can still use the existing safe
   retry/reconciliation rules; provider acceptance is not proof of inbox delivery.
   Recheck that the registration is Paid before sending an unsent E2.
8. Successful new registration responses include the issued human reference and
   initial Unpaid status for the other developer's confirmation page. Return only
   after commit. A validated replay with the same request key and accepted-payload
   hash may recover that result without reserving a second seat or creating email
   jobs. A separate duplicate request using another key receives generic acceptance
   without the existing reference, payment status or contact details. Do not add
   public email-based record lookup, recovery emails or a customer account.
9. Both CRM Staff and Admin may view registrations, mark Paid, correct payment,
   cancel unpaid registrations and retry eligible emails. Reuse the corporate
   inquiry verified Google identity checks and `STAFF_EMAILS` / `ADMIN_EMAILS`
   environment allowlists. Recheck authorization on every read and mutation.
   Other signed-in Portal users do not gain workshop CRM access. CMS permissions
   remain unchanged; do not add a new permission system or role editor.
10. Defer automated deletion of old registrations. Do not add deletion jobs,
    automatic record expiry or retention settings in this version. Keep consent
    validation and restricted staff access. This does not approve indefinite
    retention; the retention period and approved consent wording remain launch
    inputs. Proof files remain outside CRM storage.

## Workflow mapping under the confirmed scope

| Stage | FSD workflow and current email scope |
| --- | --- |
| Submit | Collect contact details, occupation, salary range, optional city and consent; validate on the server, reject spam, enforce published/open run and cutoff. |
| Allocate | Check duplicates and capacity atomically. Issue `AD-<COURSE>-<####>`. An accepted registration reserves a seat until staff cancel it. Reject new requests when full with a clear sold-out response and no record or jobs. |
| Acknowledge | Persist before email. An accepted seat registration queues E1 payment instructions. No N1 or E8. Rejected sold-out requests receive no email. |
| Respond | Return the new reference and Unpaid status after commit. Same-key validated retries recover the result; separate duplicates receive generic acceptance without existing record details. |
| Receive proof | Registrant pays offline and replies to the registration email. Staff review proof and actual funds outside the CRM. No stored proof files or PROOF_RECEIVED state. |
| Verify payment | Staff check actual funds, record method, amount, payer, provider reference and verifier, then mark PAID. Queue E2 once for that confirmation. |
| Correct payment | Staff may change Paid back to Unpaid with a required reason and audit history. The seat remains reserved; no email is sent. |
| Cancel unpaid | Staff cancel an unpaid registration with a reason and release its reserved seat. No automatic expiry or cancellation email. |
| Deferred operations | No refund records, transfers, attendee substitutions or attendance tracking in this version. |
| Change a run | Organizer schedule/venue changes or cancellation require manual communication; E12 is deferred. Registration closes on cancellation. |

In the broader FSD, seat-holding states are NEW, PROOF_RECEIVED and PAID. WAITLISTED, EXPIRED,
CANCELLED, REFUNDED and TRANSFERRED do not reserve capacity. Attendance is a
separate field. Sold out means zero available seats on an OPEN run, not another
run status. Past is currently computed from session dates in the Portal.
WAITLISTED, PROOF_RECEIVED and automatic EXPIRED behavior are excluded by the interview decisions.

The FSD permits PROOF_RECEIVED back to NEW with at least 12 hours remaining,
PAID back to PROOF_RECEIVED, and EXPIRED to PAID after a new capacity check.
Those describe its broader lifecycle. Timer and expiry transitions are excluded
by the confirmed reservation policy. Other state changes need explicit scope,
validation and audit entries, not arbitrary status editing.

## Verified code and reusable work

The table describes the inspected starting code. Step 1 changes are recorded in
the completion section and linked review below.

| Location | Current state | Reuse or gap |
| --- | --- | --- |
| Historical branch `crm/05-dashboard`, commit `49ba09d` | Registration table, public intake, per-run dashboard, paid/unpaid changes, unpaid cancellation, audit history and email retry. | Reuse transaction locking, saved server price, duplicate handling, dashboard components, stale-action checks and local test fixtures. |
| Dedicated workshop worktree, branch `crm/workshop-registration-flow`, commit `898bcbe` | Merged corporate lifecycle, consent gate, bounded intake, honeypot/Turnstile, persisted email jobs, Staff/Admin authorization, protected overdue scheduler and public content API. | Extend this existing foundation in place. CRM schema/jobs/receipts currently support corporate inquiries only. Preserve corporate and public API callers. |
| `web/` registration form | Saves a contact summary to session storage and redirects. No registration API call in the inspected submit handler. | Other developer owns integration. Supply session lookup and a documented submission/retry contract. |
| `web/` registered payment section | Promises a 48-hour hold, shows demo capacity and placeholder payment accounts/QR. | Other developer owns rendering and copy reconciliation. Supply only the approved backend response fields. |
| Existing workshop/session/payment-account/media schema | Catalogue, dated runs, price, capacity, cutoff, payment destination and QR media already exist. | Reuse these records. Do not add another workshop catalogue or duplicate payment settings. |

Older intake locks the workshop and session, protects capacity, deduplicates
normalized email per run, saves a payment-instructions job with the record, and
returns generic acceptance. It rejects sold-out submissions, reserves unpaid
seats indefinitely, uses a course-code-plus-UUID email reference, and sends no
payment-confirmation or new-registration staff email. Its dashboard has no
proof, waitlist, expiry, transfer, refund or attendance controls.

The corporate branch's plan records earlier decisions to use environment roles,
placeholder email settings for local work, external reporting, and no automated
inquiry deletion. Do not silently apply its inquiry-specific decisions, such as
omitting the consent timestamp, to workshop registrations.

The older [CRM plan](../../../../docs/product/CRM-PLAN.md) explicitly approved indefinite seat reservations,
external proof handling and no email on payment changes. The
[dashboard plan](../../../../docs/product/CRM-DASHBOARD-PLAN.md) follows those rules.
The confirmed interview decisions above now define this version's scope. The
two-email decision supersedes the older rule that payment changes send no email.

## Remaining launch inputs

These inputs do not require more backend feature-scope decisions. Use local
placeholders for development and confirm the real values and wording for launch.

| Topic | Remaining input | Implementation boundary |
| --- | --- | --- |
| Email assets/settings, OPEN-04 / OPEN-07 | Real sending domain, monitored registration reply-to and payment details are pending. | Use labelled local placeholders for E1/E2. Verify real settings before enabling delivery. Workshop staff-notification recipients are unnecessary for this scope. |
| Privacy, OPEN-18 / OPEN-16 | Registration retention period and approved demographic consent wording. | Preserve required consent and staff-only access. Automated deletion is deferred. Proof files remain in the staff inbox, outside CRM storage. |

## Implementation order

### 1. Reconcile foundations and define the lifecycle

Work in the dedicated `crm/workshop-registration-flow` worktree, starting at
`898bcbe`. The corporate implementation is already merged here; extend it in
place without copying or merging it again from the corporate worktree. Port only
useful registration behavior from historical `crm/05-dashboard` after comparing
it with the current shared code. Reuse the public content API for workshop/session
lookup where it meets the submission contract; see [public API](../public-api.md).
Preserve existing corporate and catalogue migrations. Inspect applied migration
history before adding registration migrations; do not copy conflicting historical
CRM migrations or alter already-applied ones.

Add the registration fields, immutable human reference, payment verification
details and action schemas needed for the confirmed core flow. Preserve payment
and cancellation history. Do not add refund, transfer, substitution or attendance
fields or states.
Extend shared receipts and email jobs to own either an inquiry or registration,
with database constraints. Reuse Staff/Admin authorization and audit logging.

Checks: clean database and existing baseline migrations, preserved inquiry
records/jobs, reference concurrency, active-email uniqueness by run, allowed
transitions, seat totals and course-code locking under the new states.
Reference checks cover concurrent registrations across different runs of the
same course, independent course sequences, and no reuse after cancellation.

### 2. Public intake, references and initial emails

Implement validated registration intake, stable retry keys, spam protection,
open/cutoff checks, atomic capacity allocation and duplicate handling. Save
record, reference, receipt and the E1 job in one transaction. Reject new sold-out
requests without records or jobs. Send after
commit using the shared job worker. Separate workshop intake/mail configuration
from corporate settings so enabling one cannot open the other.

Return the new reference and initial Unpaid status after commit. Same-key retries
must validate the accepted-payload hash before recovering their result. Separate
duplicates use generic acceptance without record details. Do not expose a public
email lookup or add a separate recovery-token mechanism in this version.
Every registrant subject carries `[reference]` and
uses a monitored registrations reply-to. E1 includes the amount,
configured payment destination/QR, reply-with-proof instruction and primer.
Do not include an expiry timestamp or promise automatic release after 48 hours.

Checks: last-seat races, concurrent duplicates and retry keys, changed-payload
key conflicts, sold-out behavior, rejection before persistence, complete rollback,
saved registration despite provider failure and no duplicate initial jobs.

### 3. Staff registration and payment APIs

Reuse the authorized per-run list/detail and payment action services. Extend
backend reads with lifecycle filters, reference search, seat totals and history
as needed by approved policies. Define the fields required when staff verify
payment. Do not add proof capture/rejection, attachment or waitlist endpoints.
Authorize both CRM Staff and Admin with the existing corporate access checks on
every request; database-only Portal allowlisting does not confer CRM access.
Require expected-current-state checks and return useful conflict/error responses.
Audit payment and cancellation actions. Document any caller
changes; adding new Portal controls is a separate UI task.

Staff first marking PAID queues E2 atomically with the payment change. Keep one
acknowledgment per registration across retries and repeated Paid transitions. Paid-to-Unpaid
correction requires a reason and an audit record, preserves the seat and sends
no email. Re-confirmation after correction must not send another E2 if the
original was already accepted by the provider. Unsent jobs remain subject to
current-state checks and safe retry/reconciliation rules. Do not add substitution
resends. No payment gateway is involved.

Checks: Staff/Admin access, revoked access, payment fields,
conflicting staff actions, unpaid cancellation releasing capacity,
one E2 for each intended event, safe responses and audit history. Confirm customer
proof uploads are not accepted by registration APIs. Organizer payment QR media
and E1 attachments remain separate from customer proof files.
Correction checks cover required reasons, preserved capacity, recorded actor and
old/new status, no correction email and safe repeated/stale actions.
Also cover Paid → Unpaid → Paid with one provider-accepted E2, failed E2 retry,
and suppression of unsent E2 while the registration is Unpaid.

### 4. Reservation lifetime checks

Do not build a workshop expiry scheduler. Test that an unpaid registration still
reserves capacity after 48 hours and releases its seat only on staff cancellation.
Recheck state before sending stale E1 payment instructions after cancellation or
payment. Keep the existing corporate scheduler unchanged and preserve its tests.

### 5. Existing session integrity

Use the existing workshop/session status, dates, cutoff and capacity as intake
authority. Preserve course-code locking once active registrations exist. Reject
new submissions for unpublished, closed, cancelled or started sessions. Keep past
as the existing computed date state. Do not add new organizer-change workflows,
refunds, transfers, substitutions, attendance or their email jobs in this scope.

Checks: session eligibility and cutoff boundaries, course-code immutability,
capacity changes racing with intake, preserved existing public API behavior and
no extra workshop email kinds.

### 6. Backend verification and API handoff

Publish a concrete contract for the other developer after backend implementation
is verified. Include endpoint methods/paths, session lookup, required headers,
all accepted fields, consent and bot-token requirements, configured origins/CORS,
success/error examples and retry/duplicate semantics. Describe which response
fields are safe to show publicly and how request acceptance differs from email
delivery. Document reference/status fields on new/same-key accepted results,
generic acceptance for separate duplicates, and a clear sold-out error for new
requests without available capacity. Additional registered-page rendering and
lookup features are outside this backend contract.

The submission contract must accept the authoritative `workshopSessionId`,
`fullName`, `email`, `phone`, `occupation`, `salaryRange`, optional `city`, and
explicit consent. Price, capacity and payment status are server-controlled.
Document a stable UUID request key for retries, and keep ephemeral bot tokens out
of the saved-payload hash. Unknown fields, invalid consent and invalid requests
must fail before creating records or jobs.

Exercise requests directly against the backend using isolated Postgres and
captured mail. Backend acceptance requires:

- Valid requests save all accepted answers and queue E1 only after persistence.
- Invalid, unavailable/closed/cutoff and spam requests create no registration/jobs.
- Last-seat races cannot overbook; duplicates and retries cannot reserve extra seats.
- New requests when full receive the documented sold-out response with no
  registration, waitlist, receipt or email job created for the rejection.
- Reusing a request key with changed answers returns a conflict.
- New/same-key responses include only the permitted reference/status result;
  separate duplicates expose no existing reference, status or contact answers.
- Failed writes never report success; failed delivery preserves committed records.
- Authorized staff marking PAID save the change, audit it and queue E2 once;
  unauthorized or stale actions cannot modify payment or queue acknowledgment.
- Retrying E1/E2 does not duplicate accepted sends, and no other workshop email
  jobs are created. Corporate behavior continues to pass its regression checks.

Automated deletion is excluded. Keep registration records and their audit history
throughout these checks; do not add cleanup jobs to normal application operation.

Run relevant unit/integration tests, type checking and build. For release, verify
Google sign-in, real sender/reply-to, customer E1/E2 delivery and payment
accounts/QR in controlled staging before enabling intake.
Website integration and browser/device checks remain the other developer's work;
their completion is separate from backend acceptance. No production
migration, real email send, push or deployment is included in this scan.

## Change reach and exclusions

All implementation paths below are relative to the dedicated workshop worktree.
Implementation reaches CRM schema/migrations/relations, validators, intake and
session lookup, job templates/worker/recovery, configuration examples, staff
reads/actions, workshop/session integrity guards, API handoff, tests/fixtures/demo setup
and API/setup documentation. Public website edits and new Portal UI are excluded.
Corporate callers and tests must remain valid when shared contracts change.

Keep payment gateways, customer accounts, self-service amendments, group booking,
official receipt generation, ticket QR tools, promo codes and marketing lists
out of scope. Proof uploads, proof storage, inbound parsing and PROOF_RECEIVED
are excluded. Do not add reporting, exports or bulk actions without a requirement.
Only E1 and staff-triggered E2 are automated workshop emails in this version.
Automatic expiry and waitlisting are excluded by the interview decisions.
Refund records, workshop transfers, attendee substitutions and attendance are
also deferred, including their dedicated schema fields and API actions.
Automated registration deletion and retention configuration are deferred.

## Step 1 completion, October 16, 2026

Added registrations, transactional course-code reference counters, shared
registration-owned receipt/email storage and database constraints in one additive
migration. References are immutable; active-email uniqueness is per session.
Paid and cancellation metadata are validated. The course-code guard now reads
active registrations, and the corporate worker ignores registration jobs until
their delivery step is implemented.

All 225 tests passed, including 30 isolated database checks, plus type checking,
build and whitespace checks. Clean/CMS/corporate-baseline migration paths were
verified, with original corporate records and email snapshots preserved. No old
migration was changed. See the review for the schema and test details.

Temporary test databases were removed; local Postgres was stopped with its volume
preserved. No application/production database migration, live email, public website
edit, push or deployment occurred. Actual deployment state, customer data and
production migration history remain unverified. Intake, staff actions, email
delivery and the API handoff are still steps 2–6.
