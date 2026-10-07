import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55432");
assert.equal(url.pathname, "/adrian_ding_crm_test");
const sql = postgres(url.toString(), { max: 3, onnotice: () => {} });
const userId = `crm-schema-${randomUUID()}`;
const workshopId = randomUUID();
const sessionId = randomUUID();
const secondSessionId = randomUUID();
const email = `${userId}@example.com`;
const payloadHash = "a".repeat(64);
const contact = { full_name: "Schema Check", email, phone: "+639000000000", consent_at: new Date().toISOString(), payload_hash: payloadHash };
const registrationValues = () => ({ ...contact, id: randomUUID(), idempotency_key: randomUUID(), workshop_session_id: sessionId, occupation: "Engineer", salary_range: "Prefer not to say", city: "Manila", price_centavos: 12345 });
const rollback = new Error("Roll back synthetic CRM test rows");

try {
  const columns = () => sql`select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns where table_schema = 'public'
    and table_name not in ('registration', 'corporate_inquiry', 'crm_email_job')
    order by table_name, ordinal_position`;
  const before = await columns();
  await sql.begin(async tx => {
    await tx`insert into "user" (id, name, email, email_verified) values (${userId}, 'Schema Check', ${email}, true)`;
    await tx`insert into workshop (id, slug, title) values (${workshopId}, ${userId}, 'Synthetic workshop')`;
    for (const id of [sessionId, secondSessionId]) {
      await tx`insert into workshop_session (id, workshop_id, date, end_date, start_time, end_time, price_centavos, capacity)
        values (${id}, ${workshopId}, '2030-01-01', '2030-01-01', '09:00', '10:00', 12345, 10)`;
    }
  });

  // Drizzle configures its client's JSON/timestamp serializers. Keep the raw
  // SQL checks on their own client so their parameters use postgres-js defaults.
  const migrationClient = postgres(url.toString(), { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle({ client: migrationClient }), { migrationsFolder: "./drizzle" });
  } finally { await migrationClient.end(); }
  assert.deepEqual(await columns(), before, "CRM migration changed an existing table's columns");
  assert.equal((await sql`select name from "user" where id = ${userId}`)[0].name, "Schema Check");
  assert.equal((await sql`select title from workshop where id = ${workshopId}`)[0].title, "Synthetic workshop");
  assert.equal((await sql`select capacity from workshop_session where id = ${sessionId}`)[0].capacity, 10);

  // Independent connections race on the active email/session unique index.
  const concurrentEmail = `concurrent-${email}`;
  const outcomes = await Promise.allSettled([0, 1].map(() => {
    const values = { ...registrationValues(), email: concurrentEmail };
    return sql.begin(tx => tx`insert into registration ${tx(values)}`);
  }));
  assert.equal(outcomes.filter(result => result.status === "fulfilled").length, 1,
    JSON.stringify(outcomes.filter(result => result.status === "rejected").map(result => ({ code: result.reason.code, message: result.reason.message }))));
  assert.equal(outcomes.find(result => result.status === "rejected").reason.code, "23505");

  try {
    await sql.begin(async tx => {
      const rejects = (fn, code) => assert.rejects(tx.savepoint(fn), error => error.code === code);
      const firstValues = registrationValues();
      const [first] = await tx`insert into registration ${tx(firstValues)} returning *`;
      assert.equal(first.payment_status, "unpaid");
      for (const field of ["full_name", "email", "phone", "occupation", "salary_range", "city", "price_centavos", "payload_hash"]) {
        assert.equal(first[field], firstValues[field]);
      }
      assert.equal(new Date(first.consent_at).toISOString(), contact.consent_at);
      await rejects(db => db`insert into registration ${db(registrationValues())}`, "23505");
      await rejects(db => db`insert into registration ${db({ ...registrationValues(), email: `other-${email}`, idempotency_key: first.idempotency_key })}`, "23505");
      for (const overrides of [{ email: "UPPERCASE@example.com" }, { price_centavos: -1 }, { payload_hash: "bad" }]) {
        await rejects(db => db`insert into registration ${db({ ...registrationValues(), ...overrides })}`, "23514");
      }
      await rejects(db => db`insert into registration ${db({ ...registrationValues(), consent_at: null })}`, "23502");
      await rejects(db => db`insert into registration ${db({ ...registrationValues(), workshop_session_id: randomUUID() })}`, "23503");
      await rejects(db => db`update registration set cancelled_at = now() where id = ${first.id}`, "23514");
      await tx`update registration set cancelled_at = now(), cancelled_by = ${userId}, cancellation_reason = 'Requested cancellation' where id = ${first.id}`;
      await tx`insert into registration ${tx(registrationValues())}`;
      await tx`insert into registration ${tx({ ...registrationValues(), workshop_session_id: secondSessionId })}`;
      await rejects(db => db`update registration set payment_status = 'paid' where id = ${first.id}`, "23514");
      await rejects(db => db`delete from workshop_session where id = ${sessionId}`, "23001");

      const inquiryValues = { ...contact, id: randomUUID(), idempotency_key: randomUUID(), company: "Example Co", role: "HR", program: "Leadership", attendees: "11–20", target_date: "January 2030", venue: "Our office", context: "Training inquiry", also_interested: tx.json(["Communication"]) };
      const [inquiry] = await tx`insert into corporate_inquiry ${tx(inquiryValues)} returning *`;
      assert.deepEqual(inquiry.also_interested, ["Communication"]);
      for (const field of ["full_name", "email", "phone", "company", "role", "program", "attendees", "target_date", "venue", "context", "payload_hash"]) {
        assert.equal(inquiry[field], inquiryValues[field]);
      }
      assert.equal(new Date(inquiry.consent_at).toISOString(), contact.consent_at);
      await rejects(db => db`insert into corporate_inquiry ${db({ ...inquiryValues, id: randomUUID() })}`, "23505");
      await tx`insert into corporate_inquiry ${tx({ ...inquiryValues, id: randomUUID(), idempotency_key: randomUUID() })}`;

      const payload = { from: "crm@example.com", to: [email], subject: "Test payment instructions", html: "<p>Synthetic message</p>" };
      const [job] = await tx`insert into crm_email_job (registration_id, kind, payload) values (${first.id}, 'payment_instructions', ${tx.json(payload)}) returning *`;
      assert.equal(job.state, "pending");
      assert.equal(job.attempt_count, 0);
      await rejects(db => db`insert into crm_email_job (registration_id, kind, payload) values (${first.id}, 'payment_instructions', ${db.json(payload)})`, "23505");
      await rejects(db => db`insert into crm_email_job (corporate_inquiry_id, kind, payload) values (${inquiry.id}, 'payment_instructions', ${db.json(payload)})`, "23514");
      await rejects(db => db`insert into crm_email_job (kind, payload) values ('payment_instructions', ${db.json(payload)})`, "23514");
      for (const kind of ["corporate_acknowledgment", "corporate_notification"]) {
        await tx`insert into crm_email_job (corporate_inquiry_id, kind, payload) values (${inquiry.id}, ${kind}, ${tx.json(payload)})`;
      }
      await rejects(db => db`update crm_email_job set payload = ${db.json({ ...payload, subject: "Changed" })} where id = ${job.id}`, "23514");
      await rejects(db => db`update crm_email_job set id = ${randomUUID()} where id = ${job.id}`, "23514");
      await rejects(db => db`update crm_email_job set state = 'sent' where id = ${job.id}`, "23514");
      await rejects(db => db`update crm_email_job set state = 'sending' where id = ${job.id}`, "23514");
      await rejects(db => db`update crm_email_job set last_error_code = 'raw provider response with personal details' where id = ${job.id}`, "23514");
      await tx`update crm_email_job set state = 'sending', attempt_count = 1, first_attempt_at = now(), last_attempt_at = now(), lease_expires_at = now() + interval '30 seconds' where id = ${job.id}`;
      await tx`update crm_email_job set state = 'sent', sent_at = now(), provider_id = 'synthetic-provider-id', lease_expires_at = null where id = ${job.id}`;
      assert.deepEqual((await tx`select payload from crm_email_job where id = ${job.id}`)[0].payload, payload);

      const rolledBackId = randomUUID();
      await rejects(async db => {
        await db`insert into registration ${db({ ...registrationValues(), id: rolledBackId, email: `rollback-${email}` })}`;
        await db`insert into crm_email_job (registration_id, kind, payload) values (${rolledBackId}, 'payment_instructions', '[]')`;
      }, "23514");
      assert.equal((await tx`select id from registration where id = ${rolledBackId}`).length, 0);
      await tx`delete from "user" where id = ${userId}`;
      assert.equal((await tx`select cancelled_by from registration where id = ${first.id}`)[0].cancelled_by, null);
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  console.log("CRM schema verified: additive migration, field preservation, duplicates, cancellation, consent, email ownership/immutability, delivery state, and rollback");
} finally {
  await sql.begin(async tx => {
    await tx`delete from crm_email_job where registration_id in (select id from registration where workshop_session_id in (${sessionId}, ${secondSessionId}))`;
    await tx`delete from registration where workshop_session_id in (${sessionId}, ${secondSessionId})`;
    await tx`delete from workshop_session where id in (${sessionId}, ${secondSessionId})`;
    await tx`delete from workshop where id = ${workshopId}`;
    await tx`delete from "user" where id = ${userId}`;
  }).finally(() => sql.end());
}
