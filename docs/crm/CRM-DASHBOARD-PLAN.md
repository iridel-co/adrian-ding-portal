# Admin registration dashboard

Design interview completed October 7, 2026. Bryan authorized steps 1–2 on October 8.
This document records accepted decisions and implementation progress.
Deployment remains outside this scope.

## Accepted scope

The dashboard belongs in the existing Portal. It manages workshop registrations;
corporate inquiries will have a separate screen later.

The initial dashboard manages registrations submitted through the public form.
Manual registration entry is deferred until consent and initial-email rules are
defined.

Admins can view submitted answers, mark payment Paid, reverse payment to Unpaid
with a reason, cancel an unpaid registration, and retry eligible emails.
Submitted contact details remain unchanged. Contact editing is deferred until
email-change and duplicate-registration rules are defined.

Existing accepted policies remain: each scheduled workshop has its own list;
active Paid and Unpaid registrations reserve seats; cancelling an unpaid
registration releases its seat. Payment status records staff verification of
payment outside the Portal, not a payment transaction or registration approval.
Payment changes send no email. Reversals and cancellation require a reason and
retain staff identity, time, and history. CRM access requires verified Google
identity and environment allowlisting on every request.

## Current implementation facts

The Portal has session list/calendar/editor screens and shared table/dialog
components. It has no registration screen. Existing staff APIs cover per-session
lists, details/history/email jobs, payment changes, cancellation, and safe retry.
The original list was paginated without server search, status filters, summary
counts, or email state. Step 1 adds those reads. The public session lookup excludes
past/closed sessions and cannot supply an admin picker.

Existing session cancellation copy claims registrants are notified. The current
service sends no notification. Correct that copy as part of dashboard integration;
do not infer a new email requirement from it.

## Reference and approval meaning

Bryan confirmed Luma's event admin page as the layout reference. The admin opens a
scheduled workshop and manages its registrants within that event page. In this
flow, "approve" means recording externally verified payment as Paid. There is no
separate attendance approval status or payment-proof capture. Luma's other guest
states, payment processing, and notifications are not implied by the reference.
The navigation, list, and action decisions below follow this event view.

## Accepted event-page workflow

The sidebar's Registrations entry opens a list of scheduled workshops. Upcoming
dates are shown first; admins can also access past and closed dates. Selecting a
scheduled workshop opens its event management page. Existing session screens
provide a shortcut to the same page.

The event page shows reserved seats versus capacity, Paid/Unpaid counts, and a
registrant list with payment and email status. It initially shows active
registrations, with Unpaid, Paid, Cancelled, and All filters. Name/email search
covers the whole event, not only the visible page. Cancellation remains distinct
from payment status; cancelled records appear in their own filter rather than
being counted as active unpaid seats.

Selecting a registrant opens a side panel within the event page. It shows all
submitted answers, the saved payment amount, email status, and audit history.
The approval action is labelled Mark Paid and confirms the named person and
amount before saving. Payment reversal, unpaid cancellation, and eligible email
retry are also available there. Reversal/cancellation keep their existing reason
requirements. Provider acceptance must not be labelled as inbox delivery; jobs
requiring reconciliation cannot be blindly resent.

Actions apply to one registration at a time. Bulk payment changes and CSV export
are deferred. Corporate screens, manual registration creation, and contact editing
remain deferred as previously agreed.

## Accepted refresh, access, and local testing

Refresh event totals, the registrant list, and the selected record after actions.
Provide a manual Refresh button. Automatic polling is deferred. On a stale payment
change, reload the record and explain the conflict rather than silently overwrite
another admin's change. Failed requests retain the panel and entered reason;
the interface must not imply success before the save is acknowledged.

Only authorized CRM admins see the Registrations navigation. Direct navigation
by an unauthorized CMS user shows access denied without customer data. Other CMS
access remains unchanged. Screen visibility is not a substitute for the existing
per-request staff authorization checks.

Include a repeatable local demo setup with synthetic unpaid, paid, cancelled, and
email-failure examples. It uses the isolated Compose database and captured email,
with normal staff access checks. The setup must not use production records,
real provider delivery, or an authentication bypass. Document how to start, seed,
inspect, and clean up the demo and exercise the page manually.

## Implementation outline

1. Extend authorized staff reads for event selection, whole-event search/filtering,
   seat/payment counts, and list email metadata. Admin selection includes past and
   closed dates; do not reuse the future-only public session lookup.
2. Build the Registrations navigation, event list, and event registrant page using
   existing Portal components and styles. Add the session-screen shortcut.
3. Add the registrant side panel and confirmed individual actions using existing
   payment/cancellation/retry rules. Include loading, empty, failure, access-denied,
   and stale-change states with keyboard-accessible panel/dialog behavior.
4. Add the guarded local demo setup and verify the full dashboard workflow with
   synthetic data, including search beyond the first page, cancelled-seat totals,
   staff access, conflicting changes, and email retry eligibility. Run relevant
   integration checks, typecheck, build, and browser checks.

Use the existing session catalogue and audit history. No additional approval
status, payment-proof upload, automatic paid-confirmation email, waitlist/check-in
workflow, or public website changes are implied by the Luma reference. Correct
the existing inaccurate session-cancellation notification copy during integration.

## Step 1 implementation, October 8, 2026

Authorized staff endpoints now list scheduled events and provide event detail with
capacity, reserved/remaining seats, active Paid/Unpaid counts, and cancellation
counts. Event selection includes past and closed dates and can filter by workshop;
it reuses existing session/workshop records. The registration list supports
whole-event name/email search and active/payment/cancellation filters, with
payment-email metadata. Existing API default All is preserved; the dashboard will
explicitly request Active. Search and filters execute before pagination; totals
remain independent of them.

Two added isolated database checks cover off-page search, literal wildcard text,
case-insensitive email search, all filters, cancelled-seat totals, missing jobs,
email failure metadata, bounded event selection including past/closed dates,
invalid query fields, and unauthorized access. All 72 unit tests and 20 isolated
database tests pass, for 92 distinct checks. Typecheck and build pass.

No schema, migration, provider transport, public API, or web file changed.
Steps 2–4 remain. Dashboard navigation/screens and local demo fixtures are not
implemented by step 1. No deployment or production database operation occurred.

## Step 2 implementation, October 8, 2026

Authorized admins now see Registrations in the sidebar. `/registrations` lists
scheduled events with upcoming/past/all dates, seat/payment counts, and pagination.
`/registrations/<session-id>` shows the event's dates, venue, status, seat/payment
totals, and registrants with phone, payment, saved amount, and email state. It
defaults to Active, supports server-side name/email search and all agreed filters,
and includes pagination and manual Refresh. Totals remain independent of search.

The UI follows existing Portal components and server-function/React Query patterns.
Every CRM read checks fresh Google/staff authorization, independently of the
navigation visibility check. An unauthorized CMS user sees Access denied without
customer records. Loading, failure/retry, and empty states are included. Authorized
staff get a Manage registrants shortcut in the existing session editor. Its
inaccurate automatic-cancellation-email copy was corrected.

The full suite passes 73 unit tests and 20 isolated database checks, for 93 distinct
checks, plus typecheck and build. Built-server browser verification with synthetic
signed staff sessions covered event navigation, past/closed selection, totals,
pagination, off-page search, cancelled filters, empty events, the session shortcut,
and revoked-access denial with hidden CRM navigation. At 390px width the page
stays within the viewport. Email acceptance labels do not imply inbox delivery.

Temporary browser fixtures/server were cleaned up. The checks do not verify real
Google OAuth or deployed behavior. No real email, QR, production database, or web
repository operation occurred. Registrant rows are read-only in this stage;
the side panel/payment actions remain step 3 and reusable demo setup remains
step 4. Nothing was pushed or deployed.
