import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import postgres from "postgres";
import { assertDemoDatabase, assertDemoServer, captureDemoEmail } from "./crm-demo-guard.mjs";

const local = {
  DATABASE_URL: "postgres://crm_test:crm_test_local_only@127.0.0.1:55432/adrian_ding_crm_test",
  BETTER_AUTH_URL: "http://localhost:3108", RESEND_API_KEY: "re_crm_local_test_only", CRM_INTAKE_ENABLED: "false"
};

test("refuses another database, remote Portal, real provider key, and enabled intake", () => {
  assert.doesNotThrow(() => assertDemoServer(local));
  for (const DATABASE_URL of ["postgres://user:password@production.example.com:55432/adrian_ding_crm_test", "postgres://test@127.0.0.1:5432/adrian_ding_crm_test", "postgres://test@127.0.0.1:55432/production"]) assert.throws(() => assertDemoDatabase(DATABASE_URL));
  for (const change of [{ BETTER_AUTH_URL: "https://portal.example.com" }, { RESEND_API_KEY: "re_real_key" }, { CRM_INTAKE_ENABLED: "true" }, { CRM_DEMO_FAIL_EMAILS: "maybe" }]) assert.throws(() => assertDemoServer({ ...local, ...change }));
  assert.throws(() => assertDemoDatabase(local.DATABASE_URL + "?host=production.example.com"));
  assert.throws(() => assertDemoServer({ ...local, RESEND_API_KEY: "re_private_value" }), error => !String(error).includes("re_private_value"));
});

test("captures provider mail locally without forwarding its authorization, while leaving Google login alone", async () => {
  const calls = [];
  const fakeFetch = async (...args) => { calls.push(args); return Response.json({ id: "captured" }); };
  const fetch = captureDemoEmail(fakeFetch);
  const request = { method: "POST", headers: { Authorization: "Bearer re_crm_local_test_only", "Idempotency-Key": "same-job" }, body: '{"to":["demo@example.com"]}' };
  const response = await fetch("https://api.resend.com/emails", request);
  assert.equal((await response.json()).id, "captured");
  assert.equal(calls[0][0], "http://127.0.0.1:55825/emails");
  assert.equal(calls[0][1].headers.get("authorization"), null);
  assert.equal(calls[0][1].headers.get("idempotency-key"), "same-job");
  assert.equal(calls[0][1].body, request.body);
  await fetch("https://oauth2.googleapis.com/token", { method: "POST" });
  assert.equal(calls[1][0], "https://oauth2.googleapis.com/token");
  await assert.rejects(fetch("https://api.resend.com/emails", { ...request, headers: { Authorization: "Bearer re_real_key" } }));
  await assert.rejects(fetch("https://api.resend.com/other", request));
  assert.equal(calls.length, 2);
});

test("simulated delivery failure reaches only local capture", async () => {
  const fetch = captureDemoEmail(async (url, init) => {
    assert.equal(url, "http://127.0.0.1:55825/emails");
    assert.equal(init.headers.get("x-crm-test-fail"), "true");
    return new Response(null, { status: 503 });
  }, true);
  assert.equal((await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer re_crm_local_test_only" } })).status, 503);
});

test("seed preserves exercised records; reset removes only demo data", { skip: process.env.CRM_DEMO_INTEGRATION !== "true" }, async () => {
  const database = assertDemoDatabase(process.env.DATABASE_URL);
  const db = postgres(database, { max: 1 });
  const workshopId = "f924ae48-1e75-4a94-aad3-053f72f5d210";
  const sentinel = randomUUID();
  const run = command => {
    const result = spawnSync(process.execPath, ["scripts/dev/crm-demo.mjs", command], { env: process.env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  let seeded = false;
  try {
    const [existing] = await db`select count(*)::int as count from workshop where id=${workshopId}`;
    assert.equal(existing.count, 0, "Reset your demo yourself before running this isolated seed/reset check");
    await db`insert into workshop (id,slug,title) values (${sentinel},${'demo-check-'+sentinel},'Unrelated synthetic workshop')`;
    run("seed"); seeded = true;
    const [counts] = await db`select count(*)::int as total,count(*) filter(where cancelled_at is null)::int as reserved,count(*) filter(where payment_status='paid')::int as paid from registration where workshop_session_id='f924ae48-1e75-4a94-aad3-053f72f5d211'`;
    assert.deepEqual(counts, { total: 55, reserved: 54, paid: 1 });
    const jobs = await db`select j.state from crm_email_job j join registration r on r.id=j.registration_id where r.workshop_session_id='f924ae48-1e75-4a94-aad3-053f72f5d211' order by j.state`;
    assert.deepEqual(jobs.map(row => row.state).sort(), ["failed", "needs_reconciliation", "pending", "pending", "skipped", "skipped"].sort());
    const [offPage] = await db`select full_name from registration where workshop_session_id='f924ae48-1e75-4a94-aad3-053f72f5d211' and cancelled_at is null order by created_at desc,id desc offset 53 limit 1`;
    assert.equal(offPage.full_name, "Zara Off-page Unpaid");
    await db`update registration set payment_status='paid' where workshop_session_id='f924ae48-1e75-4a94-aad3-053f72f5d211' and full_name='Maria Unpaid'`;
    run("seed");
    const [maria] = await db`select payment_status from registration where workshop_session_id='f924ae48-1e75-4a94-aad3-053f72f5d211' and full_name='Maria Unpaid'`;
    assert.equal(maria.payment_status, "paid");
    await db`update registration set email='outside-fixture@example.com' where workshop_session_id='f924ae48-1e75-4a94-aad3-053f72f5d211' and full_name='Maria Unpaid'`;
    const refused = spawnSync(process.execPath, ["scripts/dev/crm-demo.mjs", "reset"], { env: process.env, encoding: "utf8" });
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /not synthetic demo registrations/);
    await db`update registration set email='demo-50@example.com' where workshop_session_id='f924ae48-1e75-4a94-aad3-053f72f5d211' and full_name='Maria Unpaid'`;
    const [record] = await db`select id from registration where workshop_session_id='f924ae48-1e75-4a94-aad3-053f72f5d211' and full_name='Maria Unpaid'`;
    await db`insert into crm_submission_key (key,payload_hash,registration_id) values (${randomUUID()},${'a'.repeat(64)},${record.id})`;
    await db`insert into activity_log (action,entity_type,entity_id) values ('status_change','registration',${record.id})`;
    run("reset"); seeded = false;
    const [remaining] = await db`select count(*)::int as count from workshop where id=${sentinel}`;
    assert.equal(remaining.count, 1);
    const [removed] = await db`select count(*)::int as count from workshop where id=${workshopId}`;
    assert.equal(removed.count, 0);
    const [audit] = await db`select count(*)::int as count from activity_log where entity_type='registration' and entity_id=${record.id}`;
    assert.equal(audit.count, 0);
  } finally {
    if (seeded) {
      await db`update registration set email='demo-50@example.com' where workshop_session_id='f924ae48-1e75-4a94-aad3-053f72f5d211' and full_name='Maria Unpaid'`;
      run("reset");
    }
    await db`delete from workshop where id=${sentinel}`;
    await db.end();
  }
});
