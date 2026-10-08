# Test the registration dashboard locally

Run these commands from `portal/`. The demo uses the existing Compose project,
its isolated `adrian_ding_crm_test` database on port 55432, and captured mail on
port 55825. It does not use `.env`, enable public intake, or send real email.
The normal app build and production transport are unchanged.

## Prepare

Copy the example once, without overwriting your existing demo settings:

```sh
cp .env.crm-demo.example .env.crm-demo
```

In `.env.crm-demo`, fill `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`ADMIN_EMAILS` with your development Google client and the email you will use.
Configure this authorized redirect URI on that Google client:
`http://localhost:3108/api/auth/callback/google`.

Use `localhost`, not `127.0.0.1`, for the browser. The server binds only to the
loopback interface. Keep the example database address, local Portal URL, dummy
email key, and `CRM_INTAKE_ENABLED=false`. The launcher rejects other values.
Seeding creates no users, Google accounts, sessions, or login shortcuts. Sign in
normally with Google; fresh verified identity and the environment allowlist are
still required for every CRM request.

```sh
docker compose up -d --wait
node --env-file=.env.crm-demo scripts/dev/db.mjs migrate
node --env-file=.env.crm-demo scripts/dev/crm-demo.mjs seed
pnpm build
node --env-file=.env.crm-demo scripts/dev/crm-demo.mjs start
```

Open [the local Registrations page](http://localhost:3108/registrations). Starting
this demo requires a successful build and a running Compose mail service. Press
Ctrl+C in its terminal to stop the Portal. Start it through the demo launcher,
which loads the local email capture transport into the built server. `pnpm dev`
and `pnpm start` do not load that transport.

## Sample records

Choose **CRM demo workshop** in Upcoming. A fresh seed has 55 registrations,
54 reserved seats out of 60, 6 remaining seats, 1 Paid, 53 Unpaid, and 1 Cancelled.
Its date is 14 days after seeding. Past contains an empty closed run 14 days before
seeding. All registrant information is synthetic; the saved amount is ₱1,500.

| Registrant | Example |
| --- | --- |
| Maria Unpaid | Pending payment email; confirm payment or cancel with a reason. |
| Paolo Paid | Paid; reverse to Unpaid with a reason before cancellation is possible. |
| Carlos Cancelled | Appears under Cancelled or All and does not reserve a seat. |
| Fatima Failed Email | Failed payment email; retry sends only to local capture. |
| Rosa Email Review | An old attempted email requiring review; retry is unavailable. |
| Zara Off-page Unpaid | Oldest active record, beyond the first page; search finds it directly. |

There are also 49 filler registrants. Running `seed` again preserves your changes
and does not duplicate registrations. Use `reset` then `seed` for fresh examples.
The demo does not populate a real payment QR or send registration requests.

## Exercise the workflow

1. Open the upcoming event. Check the totals, then use Next to reach Zara. Search
   for `Zara` or `demo-0@example.com` from page 1; both find the off-page record.
2. Switch Active, Unpaid, Paid, Cancelled, and All. Carlos appears only in
   Cancelled/All and is excluded from reserved and unpaid totals.
3. Open Maria. Check the saved answers and amount. Mark Paid and confirm the name,
   date, and amount. The Paid count increases and history names your account.
   Pending payment instructions become Skipped. No paid-confirmation email is sent.
4. Reverse Maria to Unpaid. Blank reasons cannot be submitted. Enter a reason and
   confirm; the seat remains reserved and history preserves the reason.
5. Cancel Maria with a reason. Reserved seats decrease and Remaining increases.
   The panel stays open; Maria moves to Cancelled. No cancellation email is sent.
6. Retry Fatima's failed email. The result should be **Accepted by email provider**,
   meaning the local capture accepted it. This is not inbox delivery. Rosa has a
   review message and no retry button.
7. Open two browser tabs on Maria after resetting the demo. In tab A, open Cancel
   registration and enter a reason without confirming. In tab B, Mark Paid. Confirm
   cancellation in A. It explains the conflict, retains the reason, and blocks
   confirmation until you return and review the updated record. It does not undo
   tab B's change. Use Refresh to update other open tabs; there is no polling.
8. Use Enter to open a registrant, Tab to move through the panel, and Escape to
   close its confirmation dialog and panel. Focus returns to the initiating
   control, or Refresh when cancellation removed the row. Try a narrow window.
9. Inspect the past/closed event and its empty state. The session editor's Manage
   registrants shortcut opens the same event page.

To simulate provider rejection, stop the Portal and restart with this override:

```sh
CRM_DEMO_FAIL_EMAILS=true node --env-file=.env.crm-demo scripts/dev/crm-demo.mjs start
```

Retry a pending or failed unpaid email. It remains Failed without a success claim.
Stop the Portal and restart normally to retry successfully. Retrying an attempted
job after its safe provider window requires review, even in the demo.

To check access removal, stop the Portal, remove your email from `ADMIN_EMAILS`,
and restart. Your existing local Google session cannot read or modify CRM data;
the navigation disappears and direct access is denied. If you need to sign in
again as a CMS-only user, first add your email to the local CMS Allowed emails
page while you still have access. That CMS permission does not grant CRM access.
Restore `ADMIN_EMAILS` afterward. A second allowlisted Google account can also be
used for the conflict check. No authentication bypass is provided.

## Inspect and clean up

```sh
# Current fixture counts, without customer answers or credentials
node --env-file=.env.crm-demo scripts/dev/crm-demo.mjs inspect

# Captured synthetic messages
docker compose exec mail cat /data/mail-capture.jsonl

# Stop the Portal with Ctrl+C before cleanup.
# Remove only this demo's workshop, dates, registrations, jobs, and history.
node --env-file=.env.crm-demo scripts/dev/crm-demo.mjs reset

# Optional fresh examples
node --env-file=.env.crm-demo scripts/dev/crm-demo.mjs seed

# Stop Compose services; keep the database and captured-mail volumes.
docker compose stop
```

`reset` preserves other workshops, staff accounts, and captured mail. It refuses
cleanup if the demo workshop's identity changed or it contains registrations
outside the synthetic demo email pattern. Do not use Compose volume deletion as
demo cleanup. The capture service's idempotency memory resets when its container
restarts; it does not reproduce provider retention or inbox delivery.

## Automated checks

```sh
node --test scripts/dev/crm-demo.test.mjs
node --env-file=.env.crm-test scripts/dev/check-crm-intake.mjs
pnpm test
pnpm typecheck
pnpm build
```

The seed/reset integration check requires running Compose and no existing demo.
It refuses to replace an existing demo you have exercised. Reset it yourself first
if you want to run this optional check:

```sh
CRM_DEMO_INTEGRATION=true node --env-file=.env.crm-test --test scripts/dev/crm-demo.test.mjs
```

These checks cover local guards, captured mail, seeding/cleanup, backend rules,
and compilation. Real Google OAuth setup, real mail/QR services, and deployed
behavior require separate verification.
