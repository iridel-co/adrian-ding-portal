import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";

vi.mock("@tanstack/react-start/server-only", () => ({}));
import { queueOverdueInquiries, runCorporateScheduler } from "./scheduler";
import { relations, registration, workshop } from "@/db/schema";
import { allocateRegistrationReference } from "./registration-reference";
import { isCourseCodeLocked } from "@/features/workshops/course-code-lock";
import { updateWorkshop } from "@/features/workshops/service";
import { workshopSaveSchema } from "@/features/workshops/schemas";
import { acceptRegistration } from "./registration-service";
import { registrationSchema } from "./schemas";
import { acceptCorporateInquiry } from "./service";
import { corporateInquirySchema } from "./schemas";
import { sendEmailJob, type EmailTransport } from "./email";
import { changeInquiry, inquiryDetail, listInquiries, retryInquiryEmail } from "./staff";
import { inquiryListSchema, inquiryPageSchema, inquiryTransitionSchema } from "./schemas";
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
  const databaseNames = [`corp_clean_${suffix}`, `corp_baseline_${suffix}`, `workshop_baseline_${suffix}`];
  const admin = postgres(isolatedUrl ?? "postgres://unused@127.0.0.1:55432/adrian_ding_portal", { max: 1 });
  const clients: ReturnType<typeof postgres>[] = [];
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof relations>>;
  let baselineFolder: string | undefined;
  let corporateFolder: string | undefined;
  const createdDatabases: string[] = [];
  const actor: PortalActor = { id: `staff-${suffix}`, name: "Synthetic Staff", email: "staff@company.test", role: "staff" };
  const config = { EMAIL_FROM: "Test <test@example.invalid>", EMAIL_REPLY_TO: "sales@example.invalid",
    CORPORATE_INQUIRY_RECIPIENTS: ["primary@example.invalid", "secondary@example.invalid"] };
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
    const migrations = path.resolve("drizzle");
    const migrationNames = (await readdir(migrations)).sort();
    for (const name of migrationNames) {
      for (const [folder, cutoff] of [[baselineFolder, "20261013135747"], [corporateFolder, "20261016132854"]]) {
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
      } else { sql = raw; db = database; }
    }
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
    await sql`update workshop set status = 'published' where id = ${fixture.courseId}`;
    await sql`update workshop_session set status = 'open', capacity = ${capacity} where workshop_id = ${fixture.courseId}`;
    const answers = registrationSchema.parse({ fullName: "Synthetic Registrant", email: `${randomUUID()}@example.invalid`,
      phone: "+639171234567", consent: true, workshopSessionId: fixture.sessions[0], occupation: "Trainer", salaryRange: "Prefer not to say" });
    return { ...fixture, answers };
  }

  it("accepts concurrent retries once, preserves price/consent, and returns the original result after closure", async () => {
    const fixture = await intakeFixture();
    const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 5 }, () => acceptRegistration(db, fixture.answers, key, now)));
    expect(results.every(result => JSON.stringify(result) === JSON.stringify(results[0]))).toBe(true);
    expect(results[0]).toEqual({ accepted: true, reference: `AD-${fixture.courseCode}-0001`, paymentStatus: "unpaid" });
    const [saved] = await sql`select * from registration where idempotency_key = ${key}`;
    expect(saved.price_centavos).toBe(10000);
    expect(saved.consent_at).toEqual(now);
    await sql`update workshop_session set status = 'closed', price_centavos = 20000 where id = ${fixture.sessions[0]}`;
    expect(await acceptRegistration(db, fixture.answers, key, now)).toEqual(results[0]);
    await expect(acceptRegistration(db, { ...fixture.answers, occupation: "Changed" }, key, now))
      .rejects.toMatchObject({ code: "idempotency_key_mismatch" });
    expect((await sql`select count(*)::int as total from crm_email_job where registration_id = ${saved.id}`)[0].total).toBe(0);
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
    await sql`update registration set payment_status = 'paid', payment_method = 'bank', paid_amount_centavos = 10000,
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
      consentAt: now, priceCentavos: 10000, paymentStatus: "unpaid", cancelledAt: null });
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
    await expect(sql`update registration set payment_status = 'paid' where id = ${row.id}`)
      .rejects.toSatisfy(error => code(error) === "23514");
    await expect(sql`update registration set paid_amount_centavos = -1 where id = ${row.id}`)
      .rejects.toSatisfy(error => code(error) === "23514");
    await sql`update registration set payment_status = 'paid', payment_method = 'bank', paid_amount_centavos = 10000,
      payer_name = 'Synthetic Payer', provider_transaction_reference = 'SYNTHETIC-001', verified_at = now(), verified_by = ${actor.id}
      where id = ${row.id}`;
    await expect(sql`update registration set cancelled_at = now(), cancelled_by = ${actor.id}, cancellation_reason = 'Test'
      where id = ${row.id}`).rejects.toSatisfy(error => code(error) === "23514");
    await sql`update registration set payment_status = 'unpaid' where id = ${row.id}`;
    const [corrected] = await sql`select * from registration where id = ${row.id}`;
    expect(corrected).toMatchObject({ payment_status: "unpaid", cancelled_at: null, paid_amount_centavos: 10000,
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

  it("stores one job of each registration kind and leaves them unclaimed by corporate delivery", async () => {
    const fixture = await workshopFixture();
    const row = await saveRegistration(fixture.sessions[0], fixture.courseCode);
    const jobs = await sql`insert into crm_email_job (registration_id, kind, payload)
      values (${row.id}, 'payment_instructions', '{"subject":"Synthetic E1"}'::jsonb),
        (${row.id}, 'payment_acknowledgment', '{"subject":"Synthetic E2"}'::jsonb) returning id`;
    const capture = vi.fn<EmailTransport>(async (_payload, id) => ({ id: `captured-${id}` }));
    for (const job of jobs) await sendEmailJob(db, job.id, "unused", capture);
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
