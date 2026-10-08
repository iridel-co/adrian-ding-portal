import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { assertDemoDatabase, assertDemoServer } from "./crm-demo-guard.mjs";

const database = assertDemoDatabase(process.env.DATABASE_URL);
const command = process.argv[2];
assert.ok(["seed", "reset", "inspect", "start"].includes(command), "Usage: node --env-file=.env.crm-demo scripts/dev/crm-demo.mjs seed|reset|inspect|start");
const root = fileURLToPath(new URL("../../", import.meta.url));
const workshopId = "f924ae48-1e75-4a94-aad3-053f72f5d210";
const upcomingId = "f924ae48-1e75-4a94-aad3-053f72f5d211";
const pastId = "f924ae48-1e75-4a94-aad3-053f72f5d212";
const slug = "crm-dashboard-local-demo";

if (command === "start") {
  assertDemoServer(process.env);
  for (const key of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "ADMIN_EMAILS"]) assert.ok(process.env[key]?.trim(), `Set ${key} in .env.crm-demo for normal Google sign-in`);
  assert.ok(process.env.BETTER_AUTH_SECRET?.length >= 32, "Set a local auth secret of at least 32 characters");
  const response = await fetch("http://127.0.0.1:55825/health", { signal: AbortSignal.timeout(3000) });
  assert.ok(response.ok, "Start the Compose mail service first");
  const child = spawn(process.execPath, ["--import", "./scripts/dev/crm-demo-mail.mjs", ".output/server/index.mjs"], {
    cwd: root, stdio: "inherit", env: { ...process.env, HOST: "127.0.0.1", PORT: "3108", NITRO_HOST: "127.0.0.1", NITRO_PORT: "3108" }
  });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
  child.on("error", error => { console.error(error.message); process.exitCode = 1; });
  child.on("exit", code => { process.exitCode = code ?? 0; });
  console.log("Local demo: http://localhost:3108/registrations. Sign in with your allowlisted Google account. Emails are captured locally.");
} else {
  const db = postgres(database, { max: 1 });
  try {
    if (command === "seed" || command === "reset") await db.begin(async tx => {
      await tx`select pg_advisory_xact_lock(81726008)`;
      const [existing] = await tx`select slug from workshop where id=${workshopId}`;
      assert.ok(!existing || existing.slug === slug, "Demo ID belongs to another workshop; refusing to change it");
      if (command === "reset") {
        const [unsafe] = await tx`select count(*)::int as count from registration r join workshop_session s on s.id=r.workshop_session_id where s.workshop_id=${workshopId} and r.email not like 'demo-%@example.com'`;
        assert.equal(unsafe.count, 0, "Refusing to remove records that are not synthetic demo registrations");
        await tx`delete from activity_log where (entity_type='registration' and entity_id in (select r.id::text from registration r join workshop_session s on s.id=r.workshop_session_id where s.workshop_id=${workshopId})) or (entity_type='workshop_session' and entity_id in (select id::text from workshop_session where workshop_id=${workshopId})) or (entity_type='workshop' and entity_id=${workshopId})`;
        await tx`delete from crm_submission_key where registration_id in (select r.id from registration r join workshop_session s on s.id=r.workshop_session_id where s.workshop_id=${workshopId})`;
        await tx`delete from crm_email_job where registration_id in (select r.id from registration r join workshop_session s on s.id=r.workshop_session_id where s.workshop_id=${workshopId})`;
        await tx`delete from registration where workshop_session_id in (select id from workshop_session where workshop_id=${workshopId})`;
        await tx`delete from workshop_session where workshop_id=${workshopId}`;
        await tx`delete from workshop where id=${workshopId}`;
        console.log("Removed only demo workshop, registrations, email jobs, and history. Staff accounts and captured mail remain.");
        return;
      }
      if (existing) { console.log("Demo already exists; your changes are preserved. Use reset then seed for fresh examples."); return; }
      await tx`insert into workshop (id,slug,title,status) values (${workshopId},${slug},'CRM demo workshop','published')`;
      for (const [id, days, status] of [[upcomingId,14,'open'],[pastId,-14,'closed']]) await tx`insert into workshop_session (id,workshop_id,date,end_date,start_time,end_time,price_centavos,capacity,status,venue_name,city) values (${id},${workshopId},(now() at time zone 'Asia/Manila')::date+${days}::int,(now() at time zone 'Asia/Manila')::date+${days}::int,'09:00','17:00',150000,60,${status},'Synthetic demo venue','Cebu')`;
      const examples = [
        ["Zara Off-page Unpaid", "unpaid", false, "pending"],
        ...Array.from({ length: 49 }, (_, i) => [`Demo Registrant ${i + 1}`, "unpaid", false, null]),
        ["Maria Unpaid", "unpaid", false, "pending"],
        ["Paolo Paid", "paid", false, "skipped"],
        ["Carlos Cancelled", "unpaid", true, "skipped"],
        ["Fatima Failed Email", "unpaid", false, "failed"],
        ["Rosa Email Review", "unpaid", false, "needs_reconciliation"]
      ];
      for (let i = 0; i < examples.length; i++) {
        const [name, payment, cancelled, state] = examples[i];
        const [row] = await tx`insert into registration (full_name,email,phone,consent_at,idempotency_key,payload_hash,workshop_session_id,occupation,salary_range,city,price_centavos,payment_status,cancelled_at,cancellation_reason,created_at) values (${name},${`demo-${i}@example.com`},'+63 917 000 0000',now(),${randomUUID()},${'a'.repeat(64)},${upcomingId},'Synthetic occupation','Prefer not to say','Cebu',150000,${payment},${cancelled ? new Date() : null},${cancelled ? 'Synthetic cancellation' : null},now()-interval '2 minutes'+${i}::int*interval '1 second') returning id`;
        if (state) await tx`insert into crm_email_job (registration_id,kind,payload,state,attempt_count,first_attempt_at,last_attempt_at,last_error_code) values (${row.id},'payment_instructions',${tx.json({from:'CRM Demo <crm@example.com>',to:[`demo-${i}@example.com`],subject:`Synthetic payment instructions for ${name}`,html:'<p>Synthetic demo only. No payment is requested.</p>'})},${state},${state === 'needs_reconciliation' ? 1 : 0},${state === 'needs_reconciliation' ? new Date(Date.now()-48*3600000) : null},${state === 'needs_reconciliation' ? new Date(Date.now()-48*3600000) : null},${state === 'failed' ? 'provider_request_failed' : state === 'needs_reconciliation' ? 'idempotency_window_expired' : null})`;
      }
    });
    const sessions = await db`select s.id,s.date,s.status,count(r.id)::int as registrations,count(r.id) filter(where r.cancelled_at is null)::int as reserved,count(r.id) filter(where r.cancelled_at is null and r.payment_status='paid')::int as paid,count(r.id) filter(where r.cancelled_at is null and r.payment_status='unpaid')::int as unpaid from workshop_session s left join registration r on r.workshop_session_id=s.id where s.workshop_id=${workshopId} group by s.id order by s.date desc`;
    console.log(JSON.stringify({ workshopId, events: sessions }, null, 2));
  } finally { await db.end(); }
}
