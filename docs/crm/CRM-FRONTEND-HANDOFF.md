# Frontend handoff for Ced

The Portal API is implemented and checked locally. Public forms in `web/` still
use the demo confirmation handoff and send no requests. This guide describes
their integration; it does not change the website or authorize a release.
See [CRM-API.md](CRM-API.md) for exact payloads, limits, responses, and staff APIs.

## Workshop form

1. Configure the deployed Portal base URL as public frontend configuration.
   No provider key, database URL, or portal staff session belongs in the form.
2. Look up `/api/workshop-sessions?workshopSlug=<encoded page slug>` with
   `credentials: "omit"`. Follow `hasMore` with the next offset if needed.
3. Show the returned date, time, venue, and price for each run. Dates and times
   are Manila wall-clock values; do not parse them as the visitor's local time.
   Display centavos as pesos. Require selection of an available scheduled run.
   Do not invent a UUID from demo data or infer a run from the workshop slug.
4. Submit the selected `id` as `workshopSessionId` and the full current form
   values: `fullName`, `email`, `phone`, `occupation`, `salaryRange`, optional
   `city`, and literal boolean `consent: true` after the checkbox is checked.
5. Wait for `202` and `{ "accepted": true }` before saving confirmation-page
   display data and navigating. The current sessionStorage bridge omits
   occupation, salary, city, and consent; use form values for the API request.

Sold-out dates may remain visible but cannot be selected. If no eligible date
exists, show that registration is unavailable. On `409 session_unavailable`,
refresh the lookup and let the visitor choose an available date. An availability
read reserves nothing; the POST transaction decides whether the seat is saved.

## Corporate form

Send `fullName`, `email`, `phone`, `company`, `role`, `program`, `attendees`,
`targetDate`, `venue`, optional `context`, optional `alsoInterested`, and the
checked boolean consent to `/api/corporate-inquiries`. Use the full form values;
the current sessionStorage bridge omits phone, role, context, and consent.
Programme titles, attendee bands, and preferred dates remain text. Omit empty
optional fields or send an empty string; do not send null for city/context.

Only navigate to the inquiry confirmation after the accepted response. Acceptance
means saved; acknowledgment email delivery may still fail and need staff recovery.
Both forms should describe actual submission once integrated. Reconcile demo
footnotes and promises of immediate email or automatic seat expiry before release.

## Keys, retries, and errors

Generate a UUID v4 key once for an intended submission. Keep that key and a copy
of its submitted answers together until the result is resolved. Disable duplicate
clicks while awaiting the request. Network errors, 408, 503, and platform 429 may
be retried with the same key and unchanged payload. Respect Retry-After when the
platform supplies it. Do not generate a fresh key merely because a response was
lost; corporate inquiries in particular would create another record.

After changing rejected answers or deliberately starting a new submission, use
a new key. If an earlier attempt has an uncertain outcome, resolve it by retrying
its original key/payload first. `409 idempotency_key_mismatch` means a stored key
was reused with different answers; do not silently replace it and resubmit.

The request shape is:

```js
// Create this once when the visitor submits valid form values.
const attempt = {
  key: crypto.randomUUID(),
  payload: { workshopSessionId: selectedSession.id, ...formValues }
};

// Reuse this attempt for a retry. Build payload with only the documented fields.
const response = await fetch(`${portalBaseUrl}/api/registrations`, {
  method: "POST",
  credentials: "omit",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": attempt.key
  },
  body: JSON.stringify(attempt.payload)
});
const result = await response.json();
if (response.status === 202 && result.accepted === true) {
  // Save display-only handoff data, then navigate to confirmation.
} else {
  // Keep entered values and render the matching error; do not navigate.
}
```

Handle thrown fetch/JSON errors as an unresolved attempt. A platform error may
not have the API's JSON response shape. Use `invalid_submission.fields` for
field errors; preserve all entered values when showing them. Display a general
message for unavailable service, request rejection, or throttling. Never show a
success page solely because sessionStorage was written.

Duplicate active workshop signup returns the same generic acknowledgment. It
creates no extra seat or email and does not update the first registration's
answers. The confirmation must not promise a new email on every submission.

## Deployment handoff still required

Portal needs the exact local, preview, and deployed website origins in
`SITE_ORIGINS`. Intake remains disabled by default. Before enabling it, verify
the additive database migrations, configured payment account and real QR,
sender domain and actual provider delivery, internal recipients, and native
platform request/body limits and durable abuse controls. Those checks and real
website integration are outstanding; local synthetic tests do not prove them.

Exercise both deployed forms with controlled recipients: all fields/consent
saved, correct scheduled date and amount, accepted navigation, field errors,
full/date-closed response, offline retry, duplicate clicks, and failed email
with preserved registration. Check layout/accessibility on the actual website.
Staff should verify the records, payment/cancellation history, and recovery.

Read-only source inspection on October 7 identified these integration points:
`web/src/app/workshops/[slug]/_sections/registration-form.tsx`,
`web/src/app/corporate-training/_sections/inquiry-form.tsx`, and
`web/src/app/_lib/handoff.ts`. No web files were edited and no message was sent
to Ced. This guide is ready for review and handoff.
