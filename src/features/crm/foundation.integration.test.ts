import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { z } from "zod";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";

vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/features/media/r2", () => ({
  publicMediaUrl: vi.fn((key: string) => `https://media.company.test/${key}`),
  readPaymentQr: vi.fn(async () => ({ filename: "payment-qr.png", content: "synthetic-base64", contentType: "image/png" }))
}));
import { readPaymentQr } from "@/features/media/r2";
import { queueOverdueInquiries, runCorporateScheduler } from "./scheduler";
import { relations, registration, workshop } from "@/db/schema";
import { allocateRegistrationReference } from "./registration-reference";
import { isCourseCodeLocked } from "@/features/workshops/course-code-lock";
import { updateWorkshop } from "@/features/workshops/service";
import { workshopSaveSchema } from "@/features/workshops/schemas";
import { acceptRegistration as saveRegistrationIntake } from "./registration-service";
import { registrationSchema } from "./schemas";
import { acceptCorporateInquiry } from "./service";
import { corporateInquirySchema } from "./schemas";
import { sendEmailJob, type EmailTransport } from "./email";
import { changeInquiry, inquiryDetail, listInquiries, retryInquiryEmail } from "./staff";
import { inquiryListSchema, inquiryPageSchema, inquiryTransitionSchema } from "./schemas";
import { changeRegistration, listRegistrations, listRegistrationSessions, registrationDetail,
  registrationSessionDetail, retryRegistrationEmail } from "./registration-staff";
import { RegistrationAction, registrationActionSchema, registrationDetailSchema, registrationListSchema, registrationSessionListSchema } from "./registration-staff-schemas";
import { authorizePortalUser, type PortalActor } from "@/lib/access";

// Explicit opt-in only. Never use DATABASE_URL or the application's DB client.
const isolatedUrl = process.env.CRM_INTEGRATION_DATABASE_URL;
if (isolatedUrl) {
  const url = new URL(isolatedUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/adrian_ding_portal") {
    throw new Error("Use only the local Compose database server at 127.0.0.1:55432/adrian_ding_portal");
  }
}

describe.skipIf(!isolatedUrl)("CRM database foundation", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const databaseNames = [`corp_clean_${suffix}`, `corp_baseline_${suffix}`, `workshop_baseline_${suffix}`, `enum_baseline_${suffix}`];
  const admin = postgres(isolatedUrl ?? "postgres://unused@127.0.0.1:55432/adrian_ding_portal", { max: 1 });
  const clients: ReturnType<typeof postgres>[] = [];
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof relations>>;
  let baselineFolder: string | undefined;
  let corporateFolder: string | undefined;
  let registrationFolder: string | undefined;
  const createdDatabases: string[] = [];
  const actor: PortalActor = { id: `staff-${suffix}`, name: "Synthetic Staff", email: "staff@company.test", role: "staff" };
  const config = { EMAIL_FROM: "Test <test@example.invalid>", EMAIL_REPLY_TO: "sales@example.invalid",
    CORPORATE_INQUIRY_RECIPIENTS: ["primary@example.invalid", "secondary@example.invalid"] };
  const registrationConfig = { EMAIL_FROM: "Team <registrations@company.test>", EMAIL_REPLY_TO: "registrations@company.test",
    REGISTRATION_PAYMENT_ACCOUNT_ID: randomUUID(), REGISTRATION_EMAIL_ENABLED: false, RESEND_API_KEY: "" };
  const qrMediaId = randomUUID();
  async function acceptRegistration(database: Parameters<typeof saveRegistrationIntake>[0], data: Parameters<typeof saveRegistrationIntake>[1],
    key: string, instant?: Date) {
    return (await saveRegistrationIntake(database, data, key, registrationConfig, instant)).response;
  }
  const now = new Date("2026-10-16T10:00:00+08:00");
  const input = () => corporateInquirySchema.parse({ fullName: "Synthetic Lead", email: `${randomUUID()}@example.invalid`,
    phone: "+63 917 123 4567", consent: true, company: "Synthetic Company", role: "HR Manager", program: "Leadership",
    attendees: "16 to 30", targetDateFrom: "2027-01-12", targetDateTo: "2027-01-14", venue: "Our office", context: "<script>test</script>" });
  const deliveryConfig = { ...config, EMAIL_FROM: "Test <test@company.test>", EMAIL_REPLY_TO: "sales@company.test",
    CORPORATE_INQUIRY_RECIPIENTS: ["primary@company.test", "secondary@company.test"],
    CORPORATE_TEAM_PHONE: "+639171234567", CORPORATE_CREDIBILITY_LINE: "Synthetic approved wording" };
  const deliveryInput = () => ({ ...input(), email: `${randomUUID()}@company.test` });
  const code = (error: unknown) => {
    const failure = error as { code?: string; cause?: { code?: string } };
    return failure.code ?? failure.cause?.code;
  };

  beforeAll(async () => {
    baselineFolder = await mkdtemp(path.join(tmpdir(), "corporate-migrations-"));
    corporateFolder = await mkdtemp(path.join(tmpdir(), "workshop-migrations-"));
    registrationFolder = await mkdtemp(path.join(tmpdir(), "registration-boolean-migrations-"));
    const migrations = path.resolve("drizzle");
    const migrationNames = (await readdir(migrations)).sort();
    for (const name of migrationNames) {
      for (const [folder, cutoff] of [[baselineFolder, "20261013135747"], [corporateFolder, "20261016132854"], [registrationFolder, "20261018075245"]]) {
        if (name >= cutoff!) continue;
        const destination = path.join(folder!, name);
        await mkdir(destination);
        await cp(path.join(migrations, name), destination, { recursive: true });
      }
    }
    for (const [index, name] of databaseNames.entries()) {
      await admin`create database ${admin(name)}`;
      createdDatabases.push(name);
      const url = new URL(isolatedUrl!);
      url.pathname = `/${name}`;
      // Raw checks and Drizzle use separate clients because of JSON serializers.
      const raw = postgres(url.toString(), { max: 2, onnotice: () => {} });
      const client = postgres(url.toString(), { max: 8, onnotice: () => {} });
      clients.push(raw, client);
      const database = drizzle({ client, relations });
      if (index === 1) {
        await migrate(database, { migrationsFolder: baselineFolder });
        expect((await raw`select to_regclass('public.corporate_inquiry') as table_name`)[0].table_name).toBeNull();
        await raw`insert into workshop (slug, title) values ('corporate-migration-sentinel', 'Preserved workshop')`;
      }
      const sentinelKey = randomUUID();
      let savedInquiry: { id: string } | undefined;
      let savedJob: { id: string } | undefined;
      if (index === 2) {
        await migrate(database, { migrationsFolder: corporateFolder });
        [savedInquiry] = await raw<{ id: string }[]>`insert into corporate_inquiry
          (full_name, email, phone, idempotency_key, payload_hash, company, role, program, attendees,
            target_date, venue, sla_due_at)
          values ('Preserved Lead', 'preserved@example.invalid', '09171234567', ${sentinelKey}, ${"a".repeat(64)},
            'Preserved Company', 'HR', 'Leadership', '10', 'Next year', 'Office', now() + interval '2 days') returning *`;
        [savedJob] = await raw<{ id: string }[]>`insert into crm_email_job (corporate_inquiry_id, kind, payload)
          values (${savedInquiry!.id}, 'corporate_acknowledgment', '{"subject":"Preserved snapshot"}'::jsonb) returning *`;
        await raw`insert into crm_submission_key (key, payload_hash, corporate_inquiry_id)
          values (${sentinelKey}, ${"a".repeat(64)}, ${savedInquiry!.id})`;
      }
      let legacyRows: postgres.Row[] = [];
      let legacyHistory: postgres.Row[] = [];
      let legacyEmail: postgres.Row | undefined;
      let legacyReceipt: postgres.Row | undefined;
      if (index === 3) {
        await migrate(database, { migrationsFolder: registrationFolder });
        const staffId = `legacy-${suffix}`;
        await raw`insert into "user" (id, name, email, email_verified) values (${staffId}, 'Legacy Staff', 'legacy@company.test', true)`;
        const [course] = await raw`insert into workshop (slug, title, course_code) values ('boolean-migration', 'Preserved Workshop', 'BOOL') returning id`;
        const [session] = await raw`insert into workshop_session (workshop_id, date, end_date, start_time, end_time, price_centavos, capacity)
          values (${course.id}, '2027-01-12', '2027-01-12', '09:00', '17:00', 10000, 20) returning id`;
        for (let position = 0; position < 4; position++) {
          const verified = position === 1 || position === 3;
          const cancelled = position === 2;
          const [row] = await raw`insert into registration (full_name, email, phone, idempotency_key, payload_hash, workshop_session_id,
            reference, occupation, salary_range, consent_at, price_centavos, payment_status, payment_method,
            paid_amount_centavos, payer_name, provider_transaction_reference, verified_at, verified_by,
            cancelled_at, cancelled_by, cancellation_reason)
            values ('Preserved Registrant', ${`legacy-${position}@company.test`}, '09171234567', ${randomUUID()}, ${"a".repeat(64)},
              ${session.id}, ${`AD-BOOL-${String(position + 1).padStart(4, "0")}`}, 'Trainer', 'Prefer not to say', now(), 10000,
              ${position === 1 ? "paid" : "unpaid"}, ${verified ? "bank" : null}, ${verified ? 10000 : null},
              ${verified ? "Preserved Payer" : null}, ${verified ? "transaction-legacy" : null}, ${verified ? now : null}, ${verified ? staffId : null},
              ${cancelled ? now : null}, ${cancelled ? staffId : null}, ${cancelled ? "Preserved cancellation" : null}) returning *`;
          legacyRows.push(row);
          const changes = { paymentStatus: { from: position === 1 ? "unpaid" : position === 3 ? "paid" : null,
            to: position === 1 ? "paid" : "unpaid" }, reason: { from: null, to: "Preserved reason" } };
          const [history] = await raw`insert into activity_log (user_id, action, entity_type, entity_id, changes)
            values (${staffId}, 'status_change', 'registration', ${row.id}, ${raw.json(changes)}) returning *`;
          expect(history.changes).toEqual(changes);
          legacyHistory.push(history);
        }
        const [unchanged] = await raw`insert into activity_log (user_id, action, entity_type, entity_id, changes)
          values (${staffId}, 'update', 'corporate_inquiry', 'unrelated', '{"paymentStatus":{"from":"unpaid","to":"paid"}}') returning *`;
        legacyHistory.push(unchanged);
        await raw`insert into registration_reference_counter (course_code, last_number) values ('BOOL', 4)`;
        [legacyEmail] = await raw`insert into crm_email_job (registration_id, kind, payload)
          values (${legacyRows[1].id}, 'payment_instructions', '{"subject":"Preserved E1 snapshot"}') returning *`;
        [legacyReceipt] = await raw`insert into crm_submission_key (key, payload_hash, registration_id)
          values (${legacyRows[1].idempotency_key}, ${legacyRows[1].payload_hash}, ${legacyRows[1].id}) returning *`;
        const [invalidHistory] = await raw`insert into activity_log (user_id, action, entity_type, entity_id, changes)
          values (${staffId}, 'status_change', 'registration', ${legacyRows[0].id},
            '{"paymentStatus":{"from":"unknown-state","to":"paid"}}') returning id`;
        await expect(migrate(database, { migrationsFolder: migrations })).rejects.toSatisfy(error => code(error) === "22P02");
        expect((await raw`select payment_status from registration where id = ${legacyRows[1].id}`)[0].payment_status).toBe("paid");
        expect(await raw`select column_name from information_schema.columns where table_schema = 'public'
          and table_name = 'registration' and column_name = 'is_paid'`).toHaveLength(0);
        await raw`delete from activity_log where id = ${invalidHistory.id}`;
      }
      await migrate(database, { migrationsFolder: migrations });
      await migrate(database, { migrationsFolder: migrations });
      const [ledger] = await raw`select count(*)::int as count from drizzle.__drizzle_migrations`;
      expect(ledger.count).toBe(migrationNames.length);
      expect((await raw`select to_regclass('public.registration') as table_name`)[0].table_name).toBe("registration");
      if (index === 1) {
        expect((await raw`select title from workshop where slug = 'corporate-migration-sentinel'`)[0].title).toBe("Preserved workshop");
      } else if (index === 2) {
        expect((await raw`select * from corporate_inquiry where id = ${savedInquiry!.id}`)[0]).toEqual(savedInquiry);
        expect((await raw`select * from crm_email_job where id = ${savedJob!.id}`)[0]).toEqual({ ...savedJob, registration_id: null });
        expect((await raw`select * from crm_submission_key where key = ${sentinelKey}`)[0])
          .toMatchObject({ corporate_inquiry_id: savedInquiry!.id, registration_id: null, payload_hash: "a".repeat(64) });
      } else if (index === 3) {
        for (const old of legacyRows) {
          const { payment_status, ...preserved } = old;
          expect((await raw`select * from registration where id = ${old.id}`)[0]).toEqual({ ...preserved, is_paid: payment_status === "paid" });
        }
        for (const old of legacyHistory) {
          const changes = old.changes as { paymentStatus: { from: string | null; to: string } };
          if (old.entity_type !== "registration") {
            expect((await raw`select * from activity_log where id = ${old.id}`)[0]).toEqual(old);
            continue;
          }
          const { paymentStatus, ...otherChanges } = changes;
          expect((await raw`select * from activity_log where id = ${old.id}`)[0]).toEqual({ ...old,
            changes: { ...otherChanges, isPaid: { from: paymentStatus.from === null ? null : paymentStatus.from === "paid", to: paymentStatus.to === "paid" } } });
        }
        expect((await raw`select * from crm_email_job where id = ${legacyEmail!.id}`)[0]).toEqual(legacyEmail);
        expect((await raw`select * from crm_submission_key where key = ${legacyReceipt!.key}`)[0]).toEqual(legacyReceipt);
        expect((await raw`select last_number from registration_reference_counter where course_code = 'BOOL'`)[0].last_number).toBe(4);
        expect(await raw`select typname from pg_type where typname = 'registration_payment_status'`).toHaveLength(0);
        const [column] = await raw`select data_type, column_default, is_nullable from information_schema.columns
          where table_schema = 'public' and table_name = 'registration' and column_name = 'is_paid'`;
        expect(column).toMatchObject({ data_type: 'boolean', column_default: 'false', is_nullable: 'NO' });
      } else { sql = raw; db = database; }
    }
    await sql`insert into media (id, key, file_name, content_type, size_bytes)
      values (${qrMediaId}, 'media/synthetic-payment-qr.png', 'qr.png', 'image/png', 8)`;
    await sql`insert into payment_account (id, method, provider_name, account_name, account_number, qr_media_id)
      values (${registrationConfig.REGISTRATION_PAYMENT_ACCOUNT_ID}, 'bank', 'Synthetic Bank', 'Synthetic Team', '1234567890', ${qrMediaId})`;
    await sql`insert into "user" (id, name, email, email_verified) values (${actor.id}, ${actor.name}, ${actor.email}, true)`;
    await sql`insert into account (id, account_id, provider_id, user_id, updated_at) values (${`google-${suffix}`}, ${`google-${suffix}`}, 'google', ${actor.id}, now())`;
  }, 30000);

  afterAll(async () => {
    await Promise.all(clients.map(client => client.end()));
    try {
      for (const name of createdDatabases) await admin`drop database ${admin(name)}`;
    } finally {
      await admin.end();
      if (baselineFolder) await rm(baselineFolder, { recursive: true });
      if (corporateFolder) await rm(corporateFolder, { recursive: true });
      if (registrationFolder) await rm(registrationFolder, { recursive: true });
    }
  });

  it("extends mail kinds and still requires exactly one matching owner", async () => {
    const kinds = await sql`select enumlabel from pg_enum where enumtypid = 'crm_email_kind'::regtype order by enumsortorder`;
    expect(kinds.map(row => row.enumlabel)).toEqual(["corporate_acknowledgment", "corporate_notification", "corporate_overdue",
      "payment_instructions", "payment_acknowledgment"]);
    const columns = await sql`select column_name from information_schema.columns
      where table_name in ('crm_email_job', 'crm_submission_key') and column_name = 'registration_id'`;
    expect(columns).toHaveLength(2);
    await expect(sql`insert into crm_email_job (kind, payload) values ('corporate_notification', '{}'::jsonb)`)
      .rejects.toSatisfy(error => code(error) === "23514");
    await expect(sql`insert into crm_submission_key (key, payload_hash) values (${randomUUID()}, ${"a".repeat(64)})`)
      .rejects.toSatisfy(error => code(error) === "23514");
  });

  it("saves NEW, its deadline, receipt and email snapshots atomically", async () => {
    const answers = input();
    const key = randomUUID();
    const ids = await acceptCorporateInquiry(db, answers, key, config, now);
    expect(ids).toHaveLength(2);
    const [row] = await sql`select * from corporate_inquiry where idempotency_key = ${key}`;
    expect(row.status).toBe("NEW");
    expect(row.sla_due_at.toISOString()).toBe(new Date("2026-10-20T10:00:00+08:00").toISOString());
    expect(row).not.toHaveProperty("consent_at");
    expect(row.created_at.toISOString()).toBe(now.toISOString());
    expect(row.email).toBe(answers.email);
    expect(row.context).toBe(answers.context);
    expect(row.target_date_from.toISOString().slice(0, 10)).toBe("2027-01-12");
    expect(row.target_date_to.toISOString().slice(0, 10)).toBe("2027-01-14");
    expect(row.target_date).toBeNull();
    const jobs = await sql`select * from crm_email_job where corporate_inquiry_id = ${row.id}`;
    expect(jobs.map(job => job.kind).sort()).toEqual(["corporate_acknowledgment", "corporate_notification"]);
    expect(jobs.every(job => job.state === "pending" && job.attempt_count === 0)).toBe(true);
    expect(jobs.find(job => job.kind === "corporate_notification")!.payload.html).toContain("&lt;script&gt;");
    expect((await sql`select corporate_inquiry_id from crm_submission_key where key = ${key}`)[0].corporate_inquiry_id).toBe(row.id);
  });

  it("serializes concurrent retries, rejects changed answers, and permits a new intended inquiry", async () => {
    const answers = input();
    const key = randomUUID();
    const attempts = await Promise.all([0, 1].map(() => acceptCorporateInquiry(db, answers, key, config, now)));
    expect(attempts.map(ids => ids.length).sort()).toEqual([0, 2]);
    expect((await sql`select id from corporate_inquiry where email = ${answers.email}`)).toHaveLength(1);
    await expect(acceptCorporateInquiry(db, { ...answers, company: "Changed" }, key, config, now))
      .rejects.toMatchObject({ status: 409, code: "idempotency_key_mismatch" });
    expect(await acceptCorporateInquiry(db, answers, randomUUID(), config, now)).toHaveLength(2);
  });

  it("rolls back the inquiry and first email when storing the second email fails", async () => {
    const answers = input();
    const key = randomUUID();
    await sql`alter table crm_email_job add constraint corporate_test_reject_notification check (kind <> 'corporate_notification') not valid`;
    try {
      await expect(acceptCorporateInquiry(db, answers, key, config, now)).rejects.toSatisfy(error => code(error) === "23514");
      expect(await sql`select id from corporate_inquiry where email = ${answers.email}`).toHaveLength(0);
      expect(await sql`select key from crm_submission_key where key = ${key}`).toHaveLength(0);
    } finally {
      await sql`alter table crm_email_job drop constraint corporate_test_reject_notification`;
    }
  });

  it("enforces required proposal and loss fields in the database", async () => {
    const key = randomUUID();
    await acceptCorporateInquiry(db, input(), key, config, now);
    const [row] = await sql`select id from corporate_inquiry where idempotency_key = ${key}`;
    await expect(sql`update corporate_inquiry set status = 'LOST', closed_at = now() where id = ${row.id}`).rejects.toSatisfy(error => code(error) === "23514");
    await expect(sql`update corporate_inquiry set target_date_to = '2027-01-11' where id = ${row.id}`).rejects.toSatisfy(error => code(error) === "23514");
    await sql`update corporate_inquiry set status = 'CONTACTED', contacted_at = now() where id = ${row.id}`;
    await expect(sql`update corporate_inquiry set status = 'PROPOSAL_SENT', proposal_sent_at = now() where id = ${row.id}`).rejects.toSatisfy(error => code(error) === "23514");
    await expect(sql`update corporate_inquiry set estimated_value_centavos = -1 where id = ${row.id}`).rejects.toSatisfy(error => code(error) === "23514");
    await sql`update corporate_inquiry set status = 'PROPOSAL_SENT', proposal_sent_at = now(), estimated_value_centavos = 0 where id = ${row.id}`;
    await sql`update corporate_inquiry set status = 'WON', closed_at = now() where id = ${row.id}`;
    expect((await sql`select status from corporate_inquiry where id = ${row.id}`)[0].status).toBe("WON");
  });

  it("claims delivery once and retries the original saved message and identity after failure", async () => {
    const [ack, notice] = await acceptCorporateInquiry(db, deliveryInput(), randomUUID(), deliveryConfig);
    const capture = vi.fn<EmailTransport>(async (_payload, id) => ({ id: `captured-${id}` }));
    await Promise.all([sendEmailJob(db, ack, "unused", capture), sendEmailJob(db, ack, "unused", capture)]);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0].to).toHaveLength(1);
    expect(capture.mock.calls[0][1]).toBe(ack);
    expect((await sql`select state from crm_email_job where id = ${ack}`)[0].state).toBe("sent");
    const [original] = await sql`select id, corporate_inquiry_id, kind, payload, created_at from crm_email_job where id = ${notice}`;
    const fail = vi.fn<EmailTransport>(async () => { throw new Error("private provider details"); });
    await sendEmailJob(db, notice, "unused", fail);
    expect(fail.mock.calls[0]).toEqual([original.payload, original.id]);
    const [failed] = await sql`select * from crm_email_job where id = ${notice}`;
    expect(failed.state).toBe("failed");
    expect(failed.last_error_code).toBe("provider_request_failed");
    expect(failed.lease_expires_at).toBeNull();
    await sql`update corporate_inquiry set company = 'Changed after submission' where id = ${original.corporate_inquiry_id}`;
    await sendEmailJob(db, notice, "unused", capture);
    expect(capture.mock.calls[1]).toEqual(fail.mock.calls[0]);
    const [retried] = await sql`select id, corporate_inquiry_id, kind, payload, created_at from crm_email_job where id = ${notice}`;
    expect(retried).toEqual(original);
    expect(capture.mock.calls[1][0].to).toEqual(deliveryConfig.CORPORATE_INQUIRY_RECIPIENTS);
    expect(capture.mock.calls[1][1]).toBe(notice);
    expect((await sql`select attempt_count from crm_email_job where id = ${notice}`)[0].attempt_count).toBe(2);
  });

  it("recovers expired leases with the same key and stops retries after the provider window", async () => {
    const [recoverable, expired] = await acceptCorporateInquiry(db, deliveryInput(), randomUUID(), deliveryConfig);
    for (const id of [recoverable, expired]) {
      await sql`update crm_email_job set state = 'sending', attempt_count = 1,
        first_attempt_at = now() - interval '1 hour', last_attempt_at = now() - interval '1 hour',
        lease_expires_at = now() - interval '1 minute' where id = ${id}`;
    }
    await sql`update crm_email_job set first_attempt_at = now() - interval '25 hours' where id = ${expired}`;
    const capture = vi.fn<EmailTransport>(async (_payload, id) => ({ id: `captured-${id}` }));
    await sendEmailJob(db, recoverable, "unused", capture);
    await sendEmailJob(db, expired, "unused", capture);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][1]).toBe(recoverable);
    expect((await sql`select state from crm_email_job where id = ${expired}`)[0].state).toBe("needs_reconciliation");
  });

  const savedInquiry = async (answers = input(), mail = config) => {
    const key = randomUUID();
    const jobs = await acceptCorporateInquiry(db, answers, key, mail);
    const [row] = await sql`select id from corporate_inquiry where idempotency_key = ${key}`;
    return { id: row.id as string, jobs };
  };
  const transition = (expectedStatus: string, status: string, extra = {}) => inquiryTransitionSchema.parse({ expectedStatus, status, ...extra });

  it("applies status/search filters before pagination and includes closed inquiries in Non-spam", async () => {
    const marker = `Filter_${suffix}%`;
    const ids: string[] = [];
    for (const status of ["NEW", "CONTACTED", "LOST", "WON", "SPAM"] as const) {
      const { id } = await savedInquiry({ ...input(), company: marker });
      ids.push(id);
      if (status === "CONTACTED" || status === "WON") await changeInquiry(db, id, actor, transition("NEW", "CONTACTED"));
      if (status === "WON") {
        await changeInquiry(db, id, actor, transition("CONTACTED", "PROPOSAL_SENT", { estimatedValueCentavos: 12345 }));
        await changeInquiry(db, id, actor, transition("PROPOSAL_SENT", "WON"));
      }
      if (status === "LOST") await changeInquiry(db, id, actor, transition("NEW", "LOST", { lostReason: "Not a fit" }));
      if (status === "SPAM") await changeInquiry(db, id, actor, transition("NEW", "SPAM"));
    }
    await savedInquiry({ ...input(), company: marker.replace("_", "X").replace("%", "anything") });
    const all = await listInquiries(db, inquiryListSchema.parse({ search: marker, status: "all" }));
    expect(all.items.map(row => row.id).sort()).toEqual(ids.sort());
    const first = await listInquiries(db, inquiryListSchema.parse({ search: marker, status: "non-spam", limit: 2 }));
    const second = await listInquiries(db, inquiryListSchema.parse({ search: marker, status: "non-spam", limit: 2, offset: 2 }));
    expect(first.hasMore).toBe(true);
    expect(second.hasMore).toBe(false);
    expect([...first.items, ...second.items].map(row => row.status).sort()).toEqual(["CONTACTED", "LOST", "NEW", "WON"]);
    expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(4);
    const spam = await listInquiries(db, inquiryListSchema.parse({ search: marker, status: "SPAM" }));
    expect(spam.items).toHaveLength(1);
    expect(spam.items[0].status).toBe("SPAM");
  });

  it("serializes conflicting changes and saves one audit entry with the actor and actual timestamps", async () => {
    const { id } = await savedInquiry();
    const outcomes = await Promise.allSettled([
      changeInquiry(db, id, actor, transition("NEW", "CONTACTED")),
      changeInquiry(db, id, actor, transition("NEW", "SPAM"))
    ]);
    expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const failure = outcomes.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ status: 409, code: "inquiry_status_changed" });
    const history = await sql`select * from activity_log where entity_type = 'corporate_inquiry' and entity_id = ${id}`;
    expect(history).toHaveLength(1);
    expect(history[0].changes.status.from).toBe("NEW");
    expect(history[0].changes.actor.to).toEqual({ id: actor.id, name: actor.name, email: actor.email });
  });

  it("rolls back the state change when saving its audit entry fails", async () => {
    const { id } = await savedInquiry();
    await sql`alter table activity_log add constraint corporate_test_reject_audit check (entity_type <> 'corporate_inquiry') not valid`;
    try {
      await expect(changeInquiry(db, id, actor, transition("NEW", "CONTACTED"))).rejects.toSatisfy(error => code(error) === "23514");
      const [row] = await sql`select status, contacted_at from corporate_inquiry where id = ${id}`;
      expect(row.status).toBe("NEW");
      expect(row.contacted_at).toBeNull();
    } finally { await sql`alter table activity_log drop constraint corporate_test_reject_audit`; }
  });

  it("returns submitted dates, lifecycle and safe history/mail metadata without keys or message payloads", async () => {
    const { id } = await savedInquiry();
    await changeInquiry(db, id, actor, transition("NEW", "CONTACTED"));
    await changeInquiry(db, id, actor, transition("CONTACTED", "PROPOSAL_SENT", { estimatedValueCentavos: 0 }));
    await changeInquiry(db, id, actor, transition("PROPOSAL_SENT", "LOST", { lostReason: "Timing did not work" }));
    const detail = await inquiryDetail(db, id, inquiryPageSchema.parse({ limit: 2 }));
    expect(detail).toMatchObject({ status: "LOST", estimatedValueCentavos: 0, lostReason: "Timing did not work",
      targetDateFrom: "2027-01-12", targetDateTo: "2027-01-14" });
    expect(detail.contactedAt).toBeInstanceOf(Date);
    expect(detail.proposalSentAt).toBeInstanceOf(Date);
    expect(detail.closedAt).toBeInstanceOf(Date);
    expect(detail.history).toHaveLength(2);
    expect(detail.historyHasMore).toBe(true);
    expect(detail).not.toHaveProperty("idempotencyKey");
    expect(detail).not.toHaveProperty("payloadHash");
    for (const job of detail.emailJobs) {
      expect(job).not.toHaveProperty("payload");
      expect(job).not.toHaveProperty("providerId");
    }
    await expect(changeInquiry(db, id, actor, transition("LOST", "CONTACTED"))).rejects.toMatchObject({ code: "invalid_inquiry_transition" });
  });

  it("requires a currently verified Google account and an environment assignment", async () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    vi.stubEnv("STAFF_EMAILS", actor.email);
    try {
      expect((await authorizePortalUser(db, actor.id, "staff")).role).toBe("staff");
      await expect(authorizePortalUser(db, actor.id, "admin")).rejects.toMatchObject({ status: 403 });
      vi.stubEnv("STAFF_EMAILS", "");
      await sql`insert into allowed_email (email) values (${actor.email})`;
      await expect(authorizePortalUser(db, actor.id, "staff")).rejects.toMatchObject({ status: 403 });
      vi.stubEnv("ADMIN_EMAILS", actor.email);
      expect((await authorizePortalUser(db, actor.id, "admin")).role).toBe("admin");
      await sql`update "user" set email_verified = false where id = ${actor.id}`;
      await expect(authorizePortalUser(db, actor.id, "admin")).rejects.toMatchObject({ status: 403 });
      await sql`update "user" set email_verified = true where id = ${actor.id}`;
      await sql`update account set provider_id = 'credential' where user_id = ${actor.id}`;
      await expect(authorizePortalUser(db, actor.id, "admin")).rejects.toMatchObject({ status: 403 });
    } finally {
      await sql`update "user" set email_verified = true where id = ${actor.id}`;
      await sql`update account set provider_id = 'google' where user_id = ${actor.id}`;
      vi.unstubAllEnvs();
    }
  });

  it("retries only the specified inquiry's eligible job, audits the claim and blocks placeholder snapshots", async () => {
    const { id, jobs } = await savedInquiry(deliveryInput(), deliveryConfig);
    const capture = vi.fn<EmailTransport>(async (_payload, jobId) => ({ id: `captured-${jobId}` }));
    await expect(retryInquiryEmail(db, randomUUID(), jobs[0], actor, "unused", capture)).rejects.toMatchObject({ code: "email_job_not_found" });
    const sent = await retryInquiryEmail(db, id, jobs[0], actor, "unused", capture);
    expect(sent.state).toBe("sent");
    await expect(retryInquiryEmail(db, id, jobs[0], actor, "unused", capture)).rejects.toMatchObject({ code: "email_not_retryable" });
    expect(capture).toHaveBeenCalledTimes(1);
    const detail = await inquiryDetail(db, id, inquiryPageSchema.parse({}));
    expect(detail.history[0].changes.emailRetry?.to?.jobId).toBe(jobs[0]);
    const placeholder = await savedInquiry();
    await expect(retryInquiryEmail(db, placeholder.id, placeholder.jobs[0], actor, "unused", capture))
      .rejects.toMatchObject({ code: "email_unavailable" });
    expect(capture).toHaveBeenCalledTimes(1);
    expect((await sql`select attempt_count from crm_email_job where id = ${placeholder.jobs[0]}`)[0].attempt_count).toBe(0);
  });
  const overdueInquiry = async () => {
    const key = randomUUID();
    const jobs = await acceptCorporateInquiry(db, deliveryInput(), key, deliveryConfig, new Date(Date.now() - 7 * 86400000));
    const [row] = await sql`select id from corporate_inquiry where idempotency_key = ${key}`;
    return { id: row.id as string, jobs };
  };
  const schedulerConfig = { ...deliveryConfig, CORPORATE_EMAIL_ENABLED: true, RESEND_API_KEY: "unused",
    CORPORATE_EMAIL_FROM: deliveryConfig.EMAIL_FROM, CORPORATE_REPLY_TO: deliveryConfig.EMAIL_REPLY_TO,
    CORPORATE_PORTAL_URL: "https://portal.test" };

  it("queues one N4 across overlapping scans, only for overdue NEW inquiries", async () => {
    const overdue = await overdueInquiry();
    const upcoming = await savedInquiry(deliveryInput(), deliveryConfig);
    const closed = await overdueInquiry();
    await changeInquiry(db, closed.id, actor, transition("NEW", "LOST", { lostReason: "Not a fit" }));
    await Promise.all([queueOverdueInquiries(db, schedulerConfig), queueOverdueInquiries(db, schedulerConfig)]);
    await queueOverdueInquiries(db, schedulerConfig);
    const jobs = await sql`select * from crm_email_job where kind = 'corporate_overdue'
      and corporate_inquiry_id in (${overdue.id}, ${upcoming.id}, ${closed.id})`;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].corporate_inquiry_id).toBe(overdue.id);
    expect(jobs[0].payload.to).toEqual(deliveryConfig.CORPORATE_INQUIRY_RECIPIENTS);
    expect(jobs[0].payload.text).toContain(overdue.id);
  });

  it.each(["CONTACTED", "LOST", "SPAM"])("suppresses unclaimed reminders after %s", async status => {
    const inquiry = await overdueInquiry();
    await queueOverdueInquiries(db, schedulerConfig);
    const [job] = await sql`select id from crm_email_job where corporate_inquiry_id = ${inquiry.id} and kind = 'corporate_overdue'`;
    await changeInquiry(db, inquiry.id, actor, transition("NEW", status, status === "LOST" ? { lostReason: "Not a fit" } : {}));
    const capture = vi.fn<EmailTransport>(async () => ({ id: "captured" }));
    await sendEmailJob(db, job.id, "unused", capture);
    expect(capture).not.toHaveBeenCalled();
    expect((await sql`select state from crm_email_job where id = ${job.id}`)[0].state).toBe("skipped");
  });

  it("rechecks stale leases and changed deadlines before sending N4", async () => {
    for (const changed of ["contacted", "deadline"]) {
      const inquiry = await overdueInquiry();
      await queueOverdueInquiries(db, schedulerConfig);
      const [job] = await sql`select id from crm_email_job where corporate_inquiry_id = ${inquiry.id} and kind = 'corporate_overdue'`;
      await sql`update crm_email_job set state = 'sending', attempt_count = 1, first_attempt_at = now() - interval '1 hour',
        last_attempt_at = now() - interval '1 hour', lease_expires_at = now() - interval '1 minute' where id = ${job.id}`;
      if (changed === "contacted") await changeInquiry(db, inquiry.id, actor, transition("NEW", "CONTACTED"));
      else await sql`update corporate_inquiry set sla_due_at = now() + interval '1 day' where id = ${inquiry.id}`;
      const capture = vi.fn<EmailTransport>(async () => ({ id: "captured" }));
      await sendEmailJob(db, job.id, "unused", capture);
      expect(capture).not.toHaveBeenCalled();
      expect((await sql`select state from crm_email_job where id = ${job.id}`)[0].state).toBe("skipped");
    }
  });

  it("keeps the result of a reminder already in flight when staff record a reply", async () => {
    const inquiry = await overdueInquiry();
    await queueOverdueInquiries(db, schedulerConfig);
    const [job] = await sql`select id from crm_email_job where corporate_inquiry_id = ${inquiry.id} and kind = 'corporate_overdue'`;
    await sendEmailJob(db, job.id, "unused", async () => {
      await changeInquiry(db, inquiry.id, actor, transition("NEW", "CONTACTED"));
      return { id: "captured-in-flight" };
    });
    expect((await sql`select state, provider_id from crm_email_job where id = ${job.id}`)[0])
      .toMatchObject({ state: "sent", provider_id: "captured-in-flight" });
  });

  it("queues with sending disabled and recovers bounded batches without duplicate provider keys", async () => {
    const inquiry = await overdueInquiry();
    const capture = vi.fn<EmailTransport>(async (_payload, id) => ({ id: `captured-${id}` }));
    const paused = await runCorporateScheduler(db, { ...schedulerConfig, CORPORATE_EMAIL_ENABLED: false }, capture);
    expect(paused.processed).toBe(0);
    expect(capture).not.toHaveBeenCalled();
    expect((await sql`select count(*)::int as count from crm_email_job where corporate_inquiry_id = ${inquiry.id}`)[0].count).toBe(3);
    // Drain prior synthetic jobs using the same bounded runner, then test overlapping recovery.
    for (let tick = 0; tick < 20; tick++) await runCorporateScheduler(db, schedulerConfig, capture);
    const fresh = await overdueInquiry();
    await queueOverdueInquiries(db, schedulerConfig);
    await sql`update crm_email_job set updated_at = now() - interval '10 days' where corporate_inquiry_id = ${fresh.id}`;
    const results = await Promise.all([runCorporateScheduler(db, schedulerConfig, capture), runCorporateScheduler(db, schedulerConfig, capture)]);
    expect(results.every(result => result.processed <= 10)).toBe(true);
    const jobs = await sql`select id, state from crm_email_job where corporate_inquiry_id = ${fresh.id}`;
    expect(jobs).toHaveLength(3);
    expect(jobs.every(job => job.state === "sent")).toBe(true);
    const keys = capture.mock.calls.map(call => call[1]);
    for (const job of jobs) expect(keys.filter(key => key === job.id)).toHaveLength(1);
  }, 30000);

  it("moves expired provider attempts to reconciliation through scheduled recovery", async () => {
    const inquiry = await overdueInquiry();
    await sql`update crm_email_job set state = 'failed', attempt_count = 1, first_attempt_at = now() - interval '25 hours',
      last_attempt_at = now() - interval '25 hours', updated_at = now() - interval '30 days' where id = ${inquiry.jobs[0]}`;
    const capture = vi.fn<EmailTransport>(async (_payload, id) => ({ id: `captured-${id}` }));
    await runCorporateScheduler(db, schedulerConfig, capture);
    expect(capture.mock.calls.some(call => call[1] === inquiry.jobs[0])).toBe(false);
    expect((await sql`select state from crm_email_job where id = ${inquiry.jobs[0]}`)[0].state).toBe("needs_reconciliation");
  });

  it("recovers a scheduled provider failure on the next tick with the same saved payload and key", async () => {
    const inquiry = await savedInquiry(deliveryInput(), deliveryConfig);
    await sql`update crm_email_job set updated_at = now() - interval '10 days' where id = ${inquiry.jobs[0]}`;
    const capture = vi.fn<EmailTransport>().mockRejectedValueOnce(new Error("synthetic network failure"))
      .mockImplementation(async (_payload, id) => ({ id: `captured-${id}` }));
    await runCorporateScheduler(db, schedulerConfig, capture);
    expect((await sql`select state from crm_email_job where id = ${inquiry.jobs[0]}`)[0].state).toBe("failed");
    await sql`update crm_email_job set updated_at = now() - interval '10 days' where id = ${inquiry.jobs[0]}`;
    await runCorporateScheduler(db, schedulerConfig, capture);
    const attempts = capture.mock.calls.filter(call => call[1] === inquiry.jobs[0]);
    expect(attempts).toHaveLength(2);
    expect(attempts[0]).toEqual(attempts[1]);
    expect((await sql`select state from crm_email_job where id = ${inquiry.jobs[0]}`)[0].state).toBe("sent");
  });

  it("bounds overdue queueing and continues remaining inquiries on the next run", async () => {
    const ids: string[] = [];
    for (let index = 0; index < 55; index++) ids.push((await overdueInquiry()).id);
    expect(await queueOverdueInquiries(db, schedulerConfig)).toBe(50);
    expect(await queueOverdueInquiries(db, schedulerConfig)).toBeGreaterThanOrEqual(5);
    expect((await sql`select count(*)::int as count from crm_email_job where kind = 'corporate_overdue'
      and corporate_inquiry_id in ${sql(ids)}`)[0].count).toBe(55);
  });

  async function workshopFixture() {
    const courseCode = `W${randomUUID().slice(0, 6).toUpperCase()}`;
    const [course] = await sql`insert into workshop (slug, title, course_code)
      values (${randomUUID()}, 'Synthetic workshop', ${courseCode}) returning id`;
    const sessions = await sql`insert into workshop_session
      (workshop_id, date, end_date, start_time, end_time, price_centavos, capacity)
      values (${course.id}, '2027-01-12', '2027-01-12', '09:00', '17:00', 10000, 20),
        (${course.id}, '2027-02-12', '2027-02-12', '09:00', '17:00', 10000, 20) returning id`;
    return { courseId: course.id as string, courseCode, sessions: sessions.map(row => row.id as string) };
  }

  async function intakeFixture(capacity = 20) {
    const fixture = await workshopFixture();
    await sql`update workshop set status = 'published', primer_video_url = 'https://video.company.test/primer' where id = ${fixture.courseId}`;
    await sql`update workshop_session set status = 'open', capacity = ${capacity} where workshop_id = ${fixture.courseId}`;
    const answers = registrationSchema.parse({ fullName: "Synthetic Registrant", email: `${randomUUID()}@company.test`,
      phone: "+639171234567", consent: true, workshopSessionId: fixture.sessions[0], occupation: "Trainer", salaryRange: "Prefer not to say" });
    return { ...fixture, answers };
  }

  it("accepts concurrent retries once, preserves price/consent, and returns the original result after closure", async () => {
    const fixture = await intakeFixture();
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => acceptRegistration(db, fixture.answers, key, now)));
    expect(results.every(result => JSON.stringify(result) === JSON.stringify(results[0]))).toBe(true);
    expect(results[0]).toEqual({ accepted: true, reference: `AD-${fixture.courseCode}-0001`, isPaid: false });
    const [saved] = await sql`select * from registration where idempotency_key = ${key}`;
    expect(saved.price_centavos).toBe(10000);
    expect(saved.consent_at).toEqual(now);
    await sql`update workshop_session set status = 'closed', price_centavos = 20000 where id = ${fixture.sessions[0]}`;
    expect(await acceptRegistration(db, fixture.answers, key, now)).toEqual(results[0]);
    await expect(acceptRegistration(db, { ...fixture.answers, occupation: "Changed" }, key, now))
      .rejects.toMatchObject({ code: "idempotency_key_mismatch" });
    expect((await sql`select count(*)::int as total from crm_email_job where registration_id = ${saved.id}`)[0].total).toBe(1);
    expect((await sql`select count(*)::int as total from registration where workshop_session_id = ${fixture.sessions[0]}`)[0].total).toBe(1);
  });

  it("keeps concurrent fresh-key duplicates and their replays private even at capacity", async () => {
    const fixture = await intakeFixture(1);
    const keys = Array.from({ length: 5 }, () => randomUUID());
    const results = await Promise.all(keys.map(key => acceptRegistration(db, fixture.answers, key, now)));
    expect(results.filter(result => result.reference)).toHaveLength(1);
    for (const [index, result] of results.entries()) {
      if (!result.reference) {
        expect(result).toEqual({ accepted: true });
        expect(await acceptRegistration(db, fixture.answers, keys[index], now)).toEqual({ accepted: true });
        await expect(acceptRegistration(db, { ...fixture.answers, fullName: "Changed" }, keys[index], now))
          .rejects.toMatchObject({ code: "idempotency_key_mismatch" });
      }
    }
    expect((await sql`select count(*)::int as total from registration where workshop_session_id = ${fixture.sessions[0]}`)[0].total).toBe(1);
    expect((await sql`select count(*)::int as total from crm_submission_key where key in ${sql(keys)}`)[0].total).toBe(5);
  });

  it("allocates only the last available seat and saves no receipts for sold-out requests", async () => {
    const fixture = await intakeFixture(1);
    const keys = Array.from({ length: 6 }, () => randomUUID());
    const results = await Promise.allSettled(keys.map((key, index) => acceptRegistration(db,
      { ...fixture.answers, email: `seat-${index}@example.invalid` }, key, now)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "sold_out" });
    expect((await sql`select count(*)::int as total from crm_submission_key where key in ${sql(keys)}`)[0].total).toBe(1);
    expect((await sql`select last_number from registration_reference_counter where course_code = ${fixture.courseCode}`)[0].last_number).toBe(1);
  });

  it.each(["draft", "closed", "cancelled"])("rejects %s sessions without writes", async status => {
    const fixture = await intakeFixture();
    await sql`update workshop_session set status = ${status} where id = ${fixture.sessions[0]}`;
    const key = randomUUID();
    await expect(acceptRegistration(db, fixture.answers, key, now)).rejects.toMatchObject({ code: "session_unavailable" });
    expect(await sql`select * from crm_submission_key where key = ${key}`).toHaveLength(0);
    expect(await sql`select * from registration_reference_counter where course_code = ${fixture.courseCode}`).toHaveLength(0);
  });

  it("rejects missing/unpublished courses, missing sessions, and missing course codes", async () => {
    const fixture = await intakeFixture();
    await expect(acceptRegistration(db, { ...fixture.answers, workshopSessionId: randomUUID() }, randomUUID(), now))
      .rejects.toMatchObject({ code: "session_unavailable" });
    await sql`update workshop set status = 'draft' where id = ${fixture.courseId}`;
    await expect(acceptRegistration(db, fixture.answers, randomUUID(), now)).rejects.toMatchObject({ code: "session_unavailable" });
    await sql`update workshop set status = 'published', course_code = null where id = ${fixture.courseId}`;
    await expect(acceptRegistration(db, fixture.answers, randomUUID(), now)).rejects.toMatchObject({ code: "session_unavailable" });
  });

  it("checks exact cutoff and Manila start boundaries, even with a later cutoff", async () => {
    const fixture = await intakeFixture();
    const cutoff = new Date("2027-01-11T09:00:00+08:00");
    await sql`update workshop_session set registration_cutoff_at = ${cutoff} where id = ${fixture.sessions[0]}`;
    await acceptRegistration(db, fixture.answers, randomUUID(), new Date(cutoff.getTime() - 1));
    await expect(acceptRegistration(db, { ...fixture.answers, email: "cutoff@example.invalid" }, randomUUID(), cutoff))
      .rejects.toMatchObject({ code: "session_unavailable" });
    await sql`update workshop_session set registration_cutoff_at = '2027-01-13T09:00:00+08:00' where id = ${fixture.sessions[0]}`;
    await expect(acceptRegistration(db, { ...fixture.answers, email: "start@example.invalid" }, randomUUID(), new Date("2027-01-12T09:00:00+08:00")))
      .rejects.toMatchObject({ code: "session_unavailable" });
  });

  it("keeps old unpaid seats until cancellation, then uses the next reference; other runs remain independent", async () => {
    const fixture = await intakeFixture(1);
    const first = await acceptRegistration(db, fixture.answers, randomUUID(), now);
    const later = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const nextAnswers = { ...fixture.answers, email: "next@example.invalid" };
    await expect(acceptRegistration(db, nextAnswers, randomUUID(), later)).rejects.toMatchObject({ code: "sold_out" });
    const otherRun = await acceptRegistration(db, { ...fixture.answers, workshopSessionId: fixture.sessions[1] }, randomUUID(), later);
    expect(otherRun.reference).toBe(`AD-${fixture.courseCode}-0002`);
    await sql`update registration set cancelled_at = ${later}, cancelled_by = ${actor.id}, cancellation_reason = 'Staff cancellation'
      where reference = ${first.reference!}`;
    expect((await acceptRegistration(db, fixture.answers, randomUUID(), later)).reference).toBe(`AD-${fixture.courseCode}-0003`);
  });

  it("counts paid registrations as occupied seats", async () => {
    const fixture = await intakeFixture(1);
    const accepted = await acceptRegistration(db, fixture.answers, randomUUID(), now);
    await sql`update registration set is_paid = true, payment_method = 'bank', paid_amount_centavos = 10000,
      payer_name = 'Synthetic Payer', provider_transaction_reference = 'synthetic-payment', verified_at = ${now}, verified_by = ${actor.id}
      where reference = ${accepted.reference!}`;
    await expect(acceptRegistration(db, { ...fixture.answers, email: 'other@example.invalid' }, randomUUID(), now))
      .rejects.toMatchObject({ code: "sold_out" });
  });

  it("rolls back the registration, receipt and reference together on failure", async () => {
    const fixture = await intakeFixture();
    const key = randomUUID();
    await expect(db.transaction(async tx => {
      await acceptRegistration(tx, fixture.answers, key, now);
      throw new Error("synthetic failure");
    })).rejects.toThrow("synthetic failure");
    expect(await sql`select * from registration where idempotency_key = ${key}`).toHaveLength(0);
    expect(await sql`select * from crm_submission_key where key = ${key}`).toHaveLength(0);
    expect(await sql`select * from registration_reference_counter where course_code = ${fixture.courseCode}`).toHaveLength(0);
    expect((await acceptRegistration(db, fixture.answers, key, now)).reference).toBe(`AD-${fixture.courseCode}-0001`);
  });

  it("rejects keys already owned by the corporate flow", async () => {
    const fixture = await intakeFixture();
    const key = randomUUID();
    await acceptCorporateInquiry(db, input(), key, config, now);
    await expect(acceptRegistration(db, fixture.answers, key, now)).rejects.toMatchObject({ code: "idempotency_key_mismatch" });
  });

  it("queues E1 with an immutable payment snapshot and retries failed delivery with the same key", async () => {
    const fixture = await intakeFixture();
    const key = randomUUID();
    const result = await saveRegistrationIntake(db, fixture.answers, key, registrationConfig, now);
    expect(result.jobs).toHaveLength(1);
    const [job] = await sql`select * from crm_email_job where id = ${result.jobs[0]}`;
    expect(job.state).toBe("pending");
    expect(job.payload.subject).toContain(`[${result.response.reference}]`);
    expect(job.payload.text).toContain("₱100");
    expect(job.payload.text).toContain("1234567890");
    expect(job.payload.attachments[0].content).toBe("synthetic-base64");
    expect((await saveRegistrationIntake(db, fixture.answers, key, registrationConfig, now)).jobs).toEqual([]);
    const [saved] = await sql`select id from registration where idempotency_key = ${key}`;
    expect((await sql`select count(*)::int as total from crm_email_job where registration_id = ${saved.id}`)[0].total).toBe(1);
    const failed = vi.fn<EmailTransport>(async () => { throw new Error("synthetic provider failure"); });
    await sendEmailJob(db, job.id, "unused", failed);
    expect((await sql`select state from crm_email_job where id = ${job.id}`)[0].state).toBe("failed");
    expect(await sql`select id from registration where id = ${saved.id}`).toHaveLength(1);
    await sql`update workshop set title = 'Changed title', primer_video_url = 'https://video.company.test/changed' where id = ${fixture.courseId}`;
    await sql`update workshop_session set price_centavos = 50000 where id = ${fixture.sessions[0]}`;
    const capture = vi.fn<EmailTransport>(async (payload, providerKey) => {
      expect(payload).toEqual(job.payload);
      expect(providerKey).toBe(job.id);
      return { id: `captured-${providerKey}` };
    });
    await Promise.all([sendEmailJob(db, job.id, "unused", capture), sendEmailJob(db, job.id, "unused", capture)]);
    expect(capture).toHaveBeenCalledOnce();
    expect(failed.mock.calls[0][1]).toBe(job.id);
    expect((await sql`select state, attempt_count from crm_email_job where id = ${job.id}`)[0]).toMatchObject({ state: "sent", attempt_count: 2 });
  });

  it.each(["paid", "cancelled"])("suppresses pending E1 after the registration becomes %s", async status => {
    const fixture = await intakeFixture();
    const result = await saveRegistrationIntake(db, fixture.answers, randomUUID(), registrationConfig, now);
    const [job] = await sql`select registration_id from crm_email_job where id = ${result.jobs[0]}`;
    if (status === "cancelled") {
      await sql`update registration set cancelled_at = ${now}, cancelled_by = ${actor.id}, cancellation_reason = 'Cancelled by staff'
        where id = ${job.registration_id}`;
    } else {
      await sql`update registration set is_paid = true, payment_method = 'bank', paid_amount_centavos = 10000,
        payer_name = 'Synthetic Payer', provider_transaction_reference = 'synthetic-paid', verified_at = ${now}, verified_by = ${actor.id}
        where id = ${job.registration_id}`;
    }
    const capture = vi.fn<EmailTransport>(async () => ({ id: 'unused' }));
    await sendEmailJob(db, result.jobs[0], "unused", capture);
    expect(capture).not.toHaveBeenCalled();
    expect((await sql`select state, last_error_code, attempt_count from crm_email_job where id = ${result.jobs[0]}`)[0])
      .toMatchObject({ state: "skipped", last_error_code: "payment_instructions_obsolete", attempt_count: 0 });
  });

  it("recovers an expired E1 lease but reconciles attempts beyond the provider retry window", async () => {
    const fixture = await intakeFixture();
    const recoverable = await saveRegistrationIntake(db, fixture.answers, randomUUID(), registrationConfig, now);
    const expired = await saveRegistrationIntake(db, { ...fixture.answers, email: `${randomUUID()}@company.test` }, randomUUID(), registrationConfig, now);
    for (const [result, age] of [[recoverable, 1], [expired, 25]] as const) {
      await sql`update crm_email_job set state = 'sending', attempt_count = 1,
        first_attempt_at = now() - ${age} * interval '1 hour', last_attempt_at = now() - interval '2 minutes',
        lease_expires_at = now() - interval '1 minute' where id = ${result.jobs[0]}`;
    }
    const capture = vi.fn<EmailTransport>(async (_payload, providerKey) => ({ id: `captured-${providerKey}` }));
    await sendEmailJob(db, recoverable.jobs[0], "unused", capture);
    await sendEmailJob(db, expired.jobs[0], "unused", capture);
    expect(capture).toHaveBeenCalledOnce();
    expect((await sql`select state from crm_email_job where id = ${recoverable.jobs[0]}`)[0].state).toBe("sent");
    expect((await sql`select state from crm_email_job where id = ${expired.jobs[0]}`)[0].state).toBe("needs_reconciliation");
  });

  it("blocks local placeholder snapshots from provider delivery", async () => {
    const fixture = await intakeFixture();
    const result = await saveRegistrationIntake(db, fixture.answers, randomUUID(),
      { ...registrationConfig, EMAIL_FROM: "Team <registrations@example.invalid>" }, now);
    const capture = vi.fn<EmailTransport>(async () => ({ id: 'unused' }));
    await expect(sendEmailJob(db, result.jobs[0], "unused", capture)).rejects.toMatchObject({ code: "email_unavailable" });
    expect(capture).not.toHaveBeenCalled();
    expect((await sql`select state, attempt_count from crm_email_job where id = ${result.jobs[0]}`)[0])
      .toMatchObject({ state: "pending", attempt_count: 0 });
  });

  it("rejects missing payment/primer configuration and QR failures without saving a seat", async () => {
    const fixture = await intakeFixture();
    const key = randomUUID();
    await expect(saveRegistrationIntake(db, fixture.answers, key,
      { ...registrationConfig, REGISTRATION_PAYMENT_ACCOUNT_ID: randomUUID() }, now))
      .rejects.toMatchObject({ code: "intake_unavailable" });
    await sql`update workshop set primer_video_url = null where id = ${fixture.courseId}`;
    await expect(saveRegistrationIntake(db, fixture.answers, key, registrationConfig, now)).rejects.toMatchObject({ code: "intake_unavailable" });
    await sql`update workshop set primer_video_url = 'https://video.company.test/primer' where id = ${fixture.courseId}`;
    vi.mocked(readPaymentQr).mockRejectedValueOnce(new Error("Synthetic QR unavailable"));
    await expect(saveRegistrationIntake(db, fixture.answers, key, registrationConfig, now)).rejects.toThrow("Synthetic QR unavailable");
    expect(await sql`select id from registration where idempotency_key = ${key}`).toHaveLength(0);
    expect(await sql`select key from crm_submission_key where key = ${key}`).toHaveLength(0);
    expect(await sql`select * from registration_reference_counter where course_code = ${fixture.courseCode}`).toHaveLength(0);
  });

  it("rechecks the last seat after downloading the QR outside database locks", async () => {
    const fixture = await intakeFixture(1);
    const key = randomUUID();
    vi.mocked(readPaymentQr).mockImplementationOnce(async () => {
      await saveRegistration(fixture.sessions[0], fixture.courseCode);
      return { filename: "payment-qr.png", content: "synthetic-base64", contentType: "image/png" };
    });
    await expect(saveRegistrationIntake(db, fixture.answers, key, registrationConfig, now))
      .rejects.toMatchObject({ code: "sold_out" });
    expect(await sql`select id from registration where idempotency_key = ${key}`).toHaveLength(0);
    expect(await sql`select key from crm_submission_key where key = ${key}`).toHaveLength(0);
    expect((await sql`select count(*)::int as total from registration where workshop_session_id = ${fixture.sessions[0]}`)[0].total).toBe(1);
    expect((await sql`select last_number from registration_reference_counter where course_code = ${fixture.courseCode}`)[0].last_number).toBe(1);
  });

  it("rechecks QR metadata after download and rolls back when it changed", async () => {
    const fixture = await intakeFixture();
    const key = randomUUID();
    vi.mocked(readPaymentQr).mockImplementationOnce(async () => {
      await sql`update media set size_bytes = 9 where id = ${qrMediaId}`;
      return { filename: "payment-qr.png", content: "old-content", contentType: "image/png" };
    });
    try {
      await expect(saveRegistrationIntake(db, fixture.answers, key, registrationConfig, now)).rejects.toMatchObject({ code: "intake_unavailable" });
      expect(await sql`select id from registration where idempotency_key = ${key}`).toHaveLength(0);
      expect(await sql`select key from crm_submission_key where key = ${key}`).toHaveLength(0);
      expect(await sql`select * from registration_reference_counter where course_code = ${fixture.courseCode}`).toHaveLength(0);
    } finally { await sql`update media set size_bytes = 8 where id = ${qrMediaId}`; }
  });

  it("rolls back the seat, key and reference if saving the E1 job fails", async () => {
    const fixture = await intakeFixture();
    const key = randomUUID();
    await sql`create function reject_synthetic_e1() returns trigger language plpgsql as $$
      begin if NEW.kind = 'payment_instructions' then raise exception 'synthetic E1 write failure'; end if; return NEW; end $$`;
    await sql`create trigger reject_synthetic_e1 before insert on crm_email_job for each row execute function reject_synthetic_e1()`;
    try {
      await expect(saveRegistrationIntake(db, fixture.answers, key, registrationConfig, now)).rejects.toThrow();
      expect(await sql`select id from registration where idempotency_key = ${key}`).toHaveLength(0);
      expect(await sql`select key from crm_submission_key where key = ${key}`).toHaveLength(0);
      expect(await sql`select * from registration_reference_counter where course_code = ${fixture.courseCode}`).toHaveLength(0);
    } finally {
      await sql`drop trigger reject_synthetic_e1 on crm_email_job`;
      await sql`drop function reject_synthetic_e1()`;
    }
    expect((await saveRegistrationIntake(db, fixture.answers, key, registrationConfig, now)).jobs).toHaveLength(1);
  });

  async function staffRegistration(capacity = 20) {
    const fixture = await intakeFixture(capacity);
    const key = randomUUID();
    const accepted = await saveRegistrationIntake(db, fixture.answers, key, registrationConfig, now);
    const [row] = await sql`select * from registration where idempotency_key = ${key}`;
    return { ...fixture, id: row.id as string, row, accepted };
  }

  function staffInput(row: Record<string, unknown>, action: RegistrationAction, extra = {}) {
    const reviewed = z.object({ id: z.uuid(), updated_at: z.date() }).parse(row);
    return registrationActionSchema.parse({ id: reviewed.id, action, expectedUpdatedAt: reviewed.updated_at.toISOString(),
      expectedIsPaid: action === RegistrationAction.CorrectPayment,
      ...(action === RegistrationAction.MarkPaid ? { paymentMethod: "bank", paidAmountCentavos: 10000,
        payerName: "Synthetic Payer", providerTransactionReference: "synthetic-transaction" } : { reason: "Synthetic staff reason" }), ...extra });
  }

  it("lists registrations with literal search, lifecycle filters and pagination before limiting", async () => {
    const fixture = await intakeFixture();
    const marker = `Filter_${randomUUID()}%`;
    const ids: string[] = [];
    for (let index = 0; index < 4; index++) {
      const key = randomUUID();
      await saveRegistrationIntake(db, { ...fixture.answers, email: `${randomUUID()}@company.test`,
        fullName: index === 3 ? marker.replace("_", "X").replace("%", "anything") : marker }, key, registrationConfig, now);
      const [row] = await sql`select * from registration where idempotency_key = ${key}`;
      ids.push(row.id);
      if (index === 1) await changeRegistration(db, actor, staffInput(row, RegistrationAction.MarkPaid));
      if (index === 2) await changeRegistration(db, actor, staffInput(row, RegistrationAction.Cancel));
    }
    const list = (extra = {}) => registrationListSchema.parse({ workshopSessionId: fixture.sessions[0], search: marker, ...extra });
    const first = await listRegistrations(db, list({ filter: "all", limit: 2 }));
    const second = await listRegistrations(db, list({ filter: "all", limit: 2, offset: 2 }));
    expect(first.hasMore).toBe(true); expect(second.hasMore).toBe(false);
    expect([...first.items, ...second.items].map(row => row.id).sort()).toEqual(ids.slice(0, 3).sort());
    for (const filter of ["paid", "unpaid", "cancelled"]) expect((await listRegistrations(db, list({ filter }))).items).toHaveLength(1);
    const active = await listRegistrations(db, list());
    expect(active.items).toHaveLength(2);
    expect(active.items[0]).not.toHaveProperty("idempotencyKey");
    expect(active.items[0]).not.toHaveProperty("payloadHash");
    expect((await listRegistrations(db, list({ filter: "all", search: first.items[0].reference }))).items).toHaveLength(1);
    expect((await listRegistrations(db, { ...list(), workshopSessionId: fixture.sessions[1] })).items).toHaveLength(0);
    const session = await registrationSessionDetail(db, fixture.sessions[0]);
    expect(session.counts).toEqual({ reserved: 3, remaining: 17, paid: 1, unpaid: 2, cancelled: 1 });
  });

  it("lists staff sessions with seat totals, workshop filtering, date filters and stable pagination", async () => {
    const fixture = await staffRegistration();
    await sql`update workshop_session set date = '2020-01-12', end_date = '2020-01-12' where id = ${fixture.sessions[1]}`;
    const page = (extra = {}) => registrationSessionListSchema.parse({ workshopId: fixture.courseId, when: "all", ...extra });
    const first = await listRegistrationSessions(db, page({ limit: 1 }));
    const second = await listRegistrationSessions(db, page({ limit: 1, offset: 1 }));
    expect(first.hasMore).toBe(true); expect(second.hasMore).toBe(false);
    expect([...first.items, ...second.items].map(row => row.id).sort()).toEqual([...fixture.sessions].sort());
    expect((await listRegistrationSessions(db, page({ when: "past" }))).items.map(row => row.id)).toEqual([fixture.sessions[1]]);
    expect((await listRegistrationSessions(db, page({ when: "upcoming" }))).items.map(row => row.id)).toEqual([fixture.sessions[0]]);
    expect((await registrationSessionDetail(db, fixture.sessions[0])).counts).toEqual({ reserved: 1, remaining: 19, paid: 0, unpaid: 1, cancelled: 0 });
    await expect(registrationSessionDetail(db, randomUUID())).rejects.toMatchObject({ status: 404, code: "registration_session_not_found" });
  });

  it("records payment verification and a reasoned correction without releasing a seat or creating E2", async () => {
    const fixture = await staffRegistration(1);
    const marked = await changeRegistration(db, actor, staffInput(fixture.row, RegistrationAction.MarkPaid));
    expect(marked.isPaid).toBe(true);
    const [paid] = await sql`select * from registration where id = ${fixture.id}`;
    expect(paid).toMatchObject({ payment_method: "bank", paid_amount_centavos: 10000, payer_name: "Synthetic Payer",
      provider_transaction_reference: "synthetic-transaction", verified_by: actor.id });
    expect(paid.verified_at).toBeInstanceOf(Date);
    const corrected = await changeRegistration(db, actor, staffInput(paid, RegistrationAction.CorrectPayment, { reason: "Wrong registration selected" }));
    expect(corrected.isPaid).toBe(false);
    const [unpaid] = await sql`select * from registration where id = ${fixture.id}`;
    expect(unpaid).toMatchObject({ payment_method: paid.payment_method, paid_amount_centavos: paid.paid_amount_centavos,
      payer_name: paid.payer_name, verified_at: paid.verified_at, verified_by: paid.verified_by });
    expect((await registrationSessionDetail(db, fixture.sessions[0])).counts.reserved).toBe(1);
    expect((await sql`select kind, state from crm_email_job where registration_id = ${fixture.id}`))
      .toEqual([expect.objectContaining({ kind: "payment_instructions", state: "skipped" })]);
    const history = await sql`select changes from activity_log where entity_type = 'registration' and entity_id = ${fixture.id} order by created_at`;
    expect(history).toHaveLength(2);
    expect(history[0].changes.isPaid).toEqual({ from: false, to: true });
    expect(history[1].changes.isPaid).toEqual({ from: true, to: false });
    expect(history[1].changes.reason.to).toBe("Wrong registration selected");
    expect(history[1].changes.actor.to).toEqual({ id: actor.id, name: actor.name, email: actor.email });
    const again = await changeRegistration(db, actor, staffInput(unpaid, RegistrationAction.MarkPaid, { providerTransactionReference: "correct-transaction" }));
    expect(again.isPaid).toBe(true);
    expect((await sql`select count(*)::int as total from crm_email_job where registration_id = ${fixture.id}`)[0].total).toBe(1);
  });

  it("rejects concurrent and stale actions, including a Paid-to-Unpaid round trip", async () => {
    const fixture = await staffRegistration();
    const staleCancel = staffInput(fixture.row, RegistrationAction.Cancel);
    const results = await Promise.allSettled([
      changeRegistration(db, actor, staffInput(fixture.row, RegistrationAction.MarkPaid)),
      changeRegistration(db, actor, staffInput(fixture.row, RegistrationAction.MarkPaid))
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ status: 409, code: "registration_status_changed" });
    await expect(changeRegistration(db, actor, staleCancel)).rejects.toMatchObject({ code: "registration_status_changed" });
    const [paid] = await sql`select * from registration where id = ${fixture.id}`;
    await changeRegistration(db, actor, staffInput(paid, RegistrationAction.CorrectPayment));
    await expect(changeRegistration(db, actor, staleCancel)).rejects.toMatchObject({ code: "registration_status_changed" });
    expect((await sql`select count(*)::int as total from activity_log where entity_type = 'registration' and entity_id = ${fixture.id}`)[0].total).toBe(2);
  });

  it("cancels only unpaid registrations, releases capacity and prevents later changes", async () => {
    const fixture = await staffRegistration(1);
    const result = await changeRegistration(db, actor, staffInput(fixture.row, RegistrationAction.Cancel, { reason: "Customer withdrew" }));
    expect(result.cancelledAt).toBeInstanceOf(Date);
    const [cancelled] = await sql`select * from registration where id = ${fixture.id}`;
    expect(cancelled).toMatchObject({ cancelled_by: actor.id, cancellation_reason: "Customer withdrew", is_paid: false });
    expect((await registrationSessionDetail(db, fixture.sessions[0])).counts).toEqual({ reserved: 0, remaining: 1, paid: 0, unpaid: 0, cancelled: 1 });
    await expect(changeRegistration(db, actor, staffInput(cancelled, RegistrationAction.MarkPaid))).rejects.toMatchObject({ code: "registration_cancelled" });
    await expect(changeRegistration(db, actor, staffInput(cancelled, RegistrationAction.Cancel))).rejects.toMatchObject({ code: "registration_cancelled" });
    expect((await saveRegistrationIntake(db, fixture.answers, randomUUID(), registrationConfig, now)).response.reference)
      .toBe(`AD-${fixture.courseCode}-0002`);
    expect((await sql`select count(*)::int as total from activity_log where entity_type = 'registration' and entity_id = ${fixture.id}`)[0].total).toBe(1);
  });

  it.each([RegistrationAction.MarkPaid, RegistrationAction.Cancel] as const)("rolls back %s and email suppression if audit persistence fails", async action => {
    const fixture = await staffRegistration();
    await sql`alter table activity_log add constraint registration_test_reject_audit check (entity_type <> 'registration') not valid`;
    try {
      await expect(changeRegistration(db, actor, staffInput(fixture.row, action))).rejects.toSatisfy(error => code(error) === "23514");
      const [row] = await sql`select * from registration where id = ${fixture.id}`;
      expect(row.is_paid).toBe(false); expect(row.cancelled_at).toBeNull(); expect(row.verified_at).toBeNull();
      expect(row.updated_at).toEqual(fixture.row.updated_at);
      expect((await sql`select state from crm_email_job where id = ${fixture.accepted.jobs[0]}`)[0].state).toBe("pending");
    } finally { await sql`alter table activity_log drop constraint registration_test_reject_audit`; }
  });

  it("returns safe details, verification, seat counts and paginated history without request keys or email payloads", async () => {
    const fixture = await staffRegistration();
    await changeRegistration(db, actor, staffInput(fixture.row, RegistrationAction.MarkPaid));
    const [paid] = await sql`select * from registration where id = ${fixture.id}`;
    await changeRegistration(db, actor, staffInput(paid, RegistrationAction.CorrectPayment));
    const page = registrationDetailSchema.parse({ id: fixture.id, limit: 1 });
    const detail = await registrationDetail(db, fixture.id, page);
    expect(detail).toMatchObject({ reference: fixture.accepted.response.reference, occupation: "Trainer", isPaid: false, verifiedBy: actor.id });
    expect(detail).not.toHaveProperty("idempotencyKey"); expect(detail).not.toHaveProperty("payloadHash");
    expect(detail.emailJobs[0]).not.toHaveProperty("payload"); expect(detail.emailJobs[0]).not.toHaveProperty("providerId");
    expect(detail.session.counts.reserved).toBe(1);
    expect(detail.history).toHaveLength(1); expect(detail.historyHasMore).toBe(true);
    expect(detail.history[0].changes.reason?.to).toBe("Synthetic staff reason");
    expect((await registrationDetail(db, fixture.id, { ...page, offset: 1 })).historyHasMore).toBe(false);
    const missingId = randomUUID();
    await expect(registrationDetail(db, missingId, { ...page, id: missingId })).rejects.toMatchObject({ status: 404, code: "registration_not_found" });
    await expect(changeRegistration(db, actor, staffInput({ ...fixture.row, id: missingId }, RegistrationAction.MarkPaid)))
      .rejects.toMatchObject({ status: 404, code: "registration_not_found" });
  });

  it("retries only E1 jobs belonging to that registration and audits the verified actor", async () => {
    const fixture = await staffRegistration();
    const other = await staffRegistration();
    const jobId = fixture.accepted.jobs[0];
    const capture = vi.fn<EmailTransport>(async (_payload, key) => ({ id: `captured-${key}` }));
    await expect(retryRegistrationEmail(db, other.id, jobId, actor, "unused", capture)).rejects.toMatchObject({ code: "email_job_not_found" });
    const corporate = await savedInquiry();
    await expect(retryRegistrationEmail(db, fixture.id, corporate.jobs[0], actor, "unused", capture)).rejects.toMatchObject({ code: "email_job_not_found" });
    const [e2] = await sql`insert into crm_email_job (registration_id, kind, payload) values (${fixture.id}, 'payment_acknowledgment', '{}') returning id`;
    await expect(retryRegistrationEmail(db, fixture.id, e2.id, actor, "unused", capture)).rejects.toMatchObject({ code: "email_not_retryable" });
    expect(capture).not.toHaveBeenCalled();
    const result = await retryRegistrationEmail(db, fixture.id, jobId, actor, "unused", capture);
    expect(result.state).toBe("sent"); expect(result).not.toHaveProperty("payload");
    expect(capture.mock.calls[0][1]).toBe(jobId);
    const detail = await registrationDetail(db, fixture.id, registrationDetailSchema.parse({ id: fixture.id }));
    expect(detail.history[0].changes.emailRetry?.to).toMatchObject({ jobId, state: "sending", attemptCount: 1 });
    expect(detail.history[0].changes.actor?.to).toEqual({ id: actor.id, name: actor.name, email: actor.email });
    await expect(retryRegistrationEmail(db, fixture.id, jobId, actor, "unused", capture)).rejects.toMatchObject({ code: "email_not_retryable" });
    expect(capture).toHaveBeenCalledOnce();
  });

  it("does not claim an active lease, permits expired-lease recovery and stops after the provider window", async () => {
    const fixture = await staffRegistration();
    const jobId = fixture.accepted.jobs[0];
    await sql`update crm_email_job set state = 'sending', attempt_count = 1, first_attempt_at = now(), last_attempt_at = now(),
      lease_expires_at = now() + interval '1 minute' where id = ${jobId}`;
    const capture = vi.fn<EmailTransport>(async (_payload, key) => ({ id: `captured-${key}` }));
    await expect(retryRegistrationEmail(db, fixture.id, jobId, actor, "unused", capture)).rejects.toMatchObject({ code: "email_not_retryable" });
    expect(capture).not.toHaveBeenCalled();
    await sql`update crm_email_job set lease_expires_at = now() - interval '1 minute' where id = ${jobId}`;
    expect((await retryRegistrationEmail(db, fixture.id, jobId, actor, "unused", capture)).state).toBe("sent");
    const expired = await staffRegistration();
    await sql`update crm_email_job set state = 'failed', attempt_count = 1, first_attempt_at = now() - interval '25 hours',
      last_attempt_at = now() - interval '25 hours' where id = ${expired.accepted.jobs[0]}`;
    expect((await retryRegistrationEmail(db, expired.id, expired.accepted.jobs[0], actor, "unused", capture)).state).toBe("needs_reconciliation");
    expect(capture).toHaveBeenCalledOnce();
  });

  it("keeps failed retries retryable and rolls back a claim when its audit write fails", async () => {
    const fixture = await staffRegistration();
    const jobId = fixture.accepted.jobs[0];
    const fail = vi.fn<EmailTransport>(async () => { throw new Error("synthetic provider failure"); });
    expect((await retryRegistrationEmail(db, fixture.id, jobId, actor, "unused", fail)).state).toBe("failed");
    const capture = vi.fn<EmailTransport>(async (_payload, key) => ({ id: `captured-${key}` }));
    await sql`alter table activity_log add constraint registration_test_reject_retry_audit check (entity_type <> 'registration') not valid`;
    try {
      await expect(retryRegistrationEmail(db, fixture.id, jobId, actor, "unused", capture)).rejects.toSatisfy(error => code(error) === "23514");
      expect(capture).not.toHaveBeenCalled();
      expect((await sql`select state, attempt_count from crm_email_job where id = ${jobId}`)[0]).toMatchObject({ state: "failed", attempt_count: 1 });
    } finally { await sql`alter table activity_log drop constraint registration_test_reject_retry_audit`; }
    expect((await retryRegistrationEmail(db, fixture.id, jobId, actor, "unused", capture)).state).toBe("sent");
    expect(fail.mock.calls[0][1]).toBe(capture.mock.calls[0][1]);
  });

  function saveRegistration(sessionId: string, courseCode: string, overrides: Partial<typeof registration.$inferInsert> = {}) {
    return db.transaction(async tx => {
      const reference = await allocateRegistrationReference(tx, courseCode);
      const [row] = await tx.insert(registration).values({
        fullName: "Synthetic Registrant", email: `${randomUUID()}@example.invalid`, phone: "+639171234567",
        workshopSessionId: sessionId, reference, occupation: "Trainer", salaryRange: "Prefer not to say",
        consentAt: now, priceCentavos: 10000, idempotencyKey: randomUUID(), payloadHash: "b".repeat(64), ...overrides
      }).returning();
      return row;
    });
  }

  it("allocates unique course-wide references concurrently across runs and independent courses", async () => {
    const fixture = await workshopFixture();
    const rows = await Promise.all(Array.from({ length: 12 }, (_, index) =>
      saveRegistration(fixture.sessions[index % 2], fixture.courseCode)));
    expect(rows.map(row => row.reference).sort()).toEqual(Array.from({ length: 12 }, (_, index) =>
      `AD-${fixture.courseCode}-${String(index + 1).padStart(4, "0")}`));
    const other = await workshopFixture();
    expect((await saveRegistration(other.sessions[0], other.courseCode)).reference).toBe(`AD-${other.courseCode}-0001`);
    await sql`update registration_reference_counter set last_number = 9999 where course_code = ${other.courseCode}`;
    expect((await saveRegistration(other.sessions[0], other.courseCode)).reference).toBe(`AD-${other.courseCode}-10000`);
    await expect(db.transaction(tx => allocateRegistrationReference(tx, "invalid-code")))
      .rejects.toSatisfy(error => code(error) === "23514");
  });

  it("rolls back a failed registration's counter, permits separate runs, and never reuses cancelled references", async () => {
    const fixture = await workshopFixture();
    const email = `${randomUUID()}@example.invalid`;
    const attempts = await Promise.allSettled([0, 1].map(() => saveRegistration(fixture.sessions[0], fixture.courseCode, { email })));
    expect(attempts.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(code((attempts.find(result => result.status === "rejected") as PromiseRejectedResult).reason)).toBe("23505");
    const [first] = await sql`select * from registration where workshop_session_id = ${fixture.sessions[0]}`;
    expect(first.reference).toBe(`AD-${fixture.courseCode}-0001`);
    expect((await saveRegistration(fixture.sessions[1], fixture.courseCode, { email })).reference).toBe(`AD-${fixture.courseCode}-0002`);
    await sql`update registration set cancelled_at = now(), cancelled_by = ${actor.id}, cancellation_reason = 'Requested'
      where id = ${first.id}`;
    expect((await saveRegistration(fixture.sessions[0], fixture.courseCode, { email })).reference).toBe(`AD-${fixture.courseCode}-0003`);
    expect((await sql`select reference from registration where id = ${first.id}`)[0].reference).toBe(first.reference);
  });

  it("preserves submitted data, saved price and reference, and restricts missing/deleted sessions", async () => {
    const fixture = await workshopFixture();
    const row = await saveRegistration(fixture.sessions[0], fixture.courseCode, { city: "Cebu City" });
    expect(row).toMatchObject({ city: "Cebu City", occupation: "Trainer", salaryRange: "Prefer not to say",
      consentAt: now, priceCentavos: 10000, isPaid: false, cancelledAt: null });
    await sql`update workshop_session set price_centavos = 20000 where id = ${fixture.sessions[0]}`;
    expect((await sql`select price_centavos from registration where id = ${row.id}`)[0].price_centavos).toBe(10000);
    await expect(sql`update registration set reference = 'AD-TEST-9999' where id = ${row.id}`)
      .rejects.toSatisfy(error => code(error) === "23514");
    await expect(sql`delete from workshop_session where id = ${fixture.sessions[0]}`)
      .rejects.toMatchObject({ constraint_name: "registration_workshop_session_id_workshop_session_id_fkey" });
    await expect(saveRegistration(randomUUID(), fixture.courseCode)).rejects.toSatisfy(error => code(error) === "23503");
    for (const invalid of [{ email: " Mixed@Example.invalid " }, { payloadHash: "bad" }, { priceCentavos: -1 }, { reference: "invalid" }]) {
      await expect(saveRegistration(fixture.sessions[0], fixture.courseCode, invalid))
        .rejects.toSatisfy(error => code(error) === "23514");
    }
  });

  it("requires complete payment verification, retains it on correction, and validates cancellation", async () => {
    const fixture = await workshopFixture();
    const row = await saveRegistration(fixture.sessions[0], fixture.courseCode);
    await expect(sql`update registration set is_paid = true where id = ${row.id}`)
      .rejects.toSatisfy(error => code(error) === "23514");
    await expect(sql`update registration set paid_amount_centavos = -1 where id = ${row.id}`)
      .rejects.toSatisfy(error => code(error) === "23514");
    await sql`update registration set is_paid = true, payment_method = 'bank', paid_amount_centavos = 10000,
      payer_name = 'Synthetic Payer', provider_transaction_reference = 'SYNTHETIC-001', verified_at = now(), verified_by = ${actor.id}
      where id = ${row.id}`;
    await expect(sql`update registration set cancelled_at = now(), cancelled_by = ${actor.id}, cancellation_reason = 'Test'
      where id = ${row.id}`).rejects.toSatisfy(error => code(error) === "23514");
    await sql`update registration set is_paid = false where id = ${row.id}`;
    const [corrected] = await sql`select * from registration where id = ${row.id}`;
    expect(corrected).toMatchObject({ is_paid: false, cancelled_at: null, paid_amount_centavos: 10000,
      verified_by: actor.id, payer_name: "Synthetic Payer", provider_transaction_reference: "SYNTHETIC-001" });
    await expect(sql`update registration set cancelled_at = now(), cancelled_by = ${actor.id}, cancellation_reason = ' '
      where id = ${row.id}`).rejects.toSatisfy(error => code(error) === "23514");
    await expect(sql`delete from "user" where id = ${actor.id}`)
      .rejects.toMatchObject({ constraint_name: "registration_verified_by_user_id_fkey" });
  });

  it("locks course-code edits while any run has an active registration", async () => {
    const fixture = await workshopFixture();
    expect(await isCourseCodeLocked(db, fixture.courseId)).toBe(false);
    const row = await saveRegistration(fixture.sessions[1], fixture.courseCode);
    expect(await isCourseCodeLocked(db, fixture.courseId)).toBe(true);
    const [course] = await db.select().from(workshop).where(eq(workshop.id, fixture.courseId));
    const values = workshopSaveSchema.parse({ ...course, courseCode: `C${fixture.courseCode.slice(1)}`, tagIds: [],
      primerVideoUrl: course.primerVideoUrl ?? "", defaultVenueMapUrl: course.defaultVenueMapUrl ?? "" });
    await expect(updateWorkshop(db, actor, { id: fixture.courseId, values })).rejects.toThrow("course code is locked");
    await sql`update registration set cancelled_at = now(), cancelled_by = ${actor.id}, cancellation_reason = 'Requested'
      where id = ${row.id}`;
    expect(await isCourseCodeLocked(db, fixture.courseId)).toBe(false);
    await updateWorkshop(db, actor, { id: fixture.courseId, values });
    expect((await sql`select course_code from workshop where id = ${fixture.courseId}`)[0].course_code).toBe(values.courseCode);
    expect((await sql`select reference from registration where id = ${row.id}`)[0].reference).toBe(row.reference);
  });

  it("requires exactly one owner for request keys and the correct owner for each email kind", async () => {
    const fixture = await workshopFixture();
    const row = await saveRegistration(fixture.sessions[0], fixture.courseCode);
    const inquiry = await savedInquiry();
    await sql`insert into crm_submission_key (key, payload_hash, registration_id)
      values (${row.idempotencyKey}, ${row.payloadHash}, ${row.id})`;
    const duplicateKey = randomUUID();
    await sql`insert into crm_submission_key (key, payload_hash, registration_id)
      values (${duplicateKey}, ${"c".repeat(64)}, ${row.id})`;
    const [original] = await sql`select idempotency_key, payload_hash from registration where id = ${row.id}`;
    expect(original).toMatchObject({ idempotency_key: row.idempotencyKey, payload_hash: row.payloadHash });
    expect((await sql`select key from crm_submission_key where registration_id = ${row.id}`)).toHaveLength(2);
    await expect(sql`insert into crm_submission_key (key, payload_hash, corporate_inquiry_id, registration_id)
      values (${randomUUID()}, ${row.payloadHash}, ${inquiry.id}, ${row.id})`).rejects.toSatisfy(error => code(error) === "23514");
    await expect(sql`insert into crm_submission_key (key, payload_hash, registration_id)
      values (${row.idempotencyKey}, ${row.payloadHash}, ${row.id})`).rejects.toSatisfy(error => code(error) === "23505");
    await expect(sql`insert into crm_submission_key (key, payload_hash, registration_id)
      values (${randomUUID()}, ${row.payloadHash}, ${randomUUID()})`).rejects.toSatisfy(error => code(error) === "23503");
    for (const kind of ["corporate_acknowledgment", "corporate_notification", "corporate_overdue"]) {
      await expect(sql`insert into crm_email_job (registration_id, kind, payload) values (${row.id}, ${kind}, '{}'::jsonb)`)
        .rejects.toSatisfy(error => code(error) === "23514");
    }
    await expect(sql`insert into crm_email_job (corporate_inquiry_id, kind, payload)
      values (${inquiry.id}, 'payment_instructions', '{}'::jsonb)`).rejects.toSatisfy(error => code(error) === "23514");
    await expect(sql`insert into crm_email_job (corporate_inquiry_id, registration_id, kind, payload)
      values (${inquiry.id}, ${row.id}, 'payment_instructions', '{}'::jsonb)`).rejects.toSatisfy(error => code(error) === "23514");
  });

  it("stores one job of each registration kind and leaves E2 unclaimed until its delivery step", async () => {
    const fixture = await workshopFixture();
    const row = await saveRegistration(fixture.sessions[0], fixture.courseCode);
    const jobs = await sql`insert into crm_email_job (registration_id, kind, payload)
      values (${row.id}, 'payment_instructions', '{"subject":"Synthetic E1"}'::jsonb),
        (${row.id}, 'payment_acknowledgment', '{"subject":"Synthetic E2"}'::jsonb) returning id`;
    const capture = vi.fn<EmailTransport>(async (_payload, id) => ({ id: `captured-${id}` }));
    await sendEmailJob(db, jobs[1].id, "unused", capture);
    expect(capture).not.toHaveBeenCalled();
    expect((await sql`select state from crm_email_job where registration_id = ${row.id}`).every(job => job.state === "pending")).toBe(true);
    for (const kind of ["payment_instructions", "payment_acknowledgment"]) {
      await expect(sql`insert into crm_email_job (registration_id, kind, payload) values (${row.id}, ${kind}, '{}'::jsonb)`)
        .rejects.toSatisfy(error => code(error) === "23505");
    }
    const linked = await db.query.registration.findFirst({ where: { id: row.id }, with: { workshopSession: true, emailJobs: true } });
    expect(linked?.workshopSession?.id).toBe(fixture.sessions[0]);
    expect(linked?.emailJobs).toHaveLength(2);
  });

});
