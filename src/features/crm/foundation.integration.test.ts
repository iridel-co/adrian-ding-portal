import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

vi.mock("@tanstack/react-start/server-only", () => ({}));
import { queueOverdueInquiries, runCorporateScheduler } from "./scheduler";
import { relations } from "@/db/schema";
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

describe.skipIf(!isolatedUrl)("Corporate database foundation", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const databaseNames = [`corp_clean_${suffix}`, `corp_baseline_${suffix}`];
  const admin = postgres(isolatedUrl ?? "postgres://unused@127.0.0.1:55432/adrian_ding_portal", { max: 1 });
  const clients: ReturnType<typeof postgres>[] = [];
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof relations>>;
  let baselineFolder: string | undefined;
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
    const migrations = path.resolve("drizzle");
    for (const name of await readdir(migrations)) {
      if (name.endsWith("_crm_corporate_inquiry")) continue;
      const destination = path.join(baselineFolder, name);
      await mkdir(destination);
      await cp(path.join(migrations, name), destination, { recursive: true });
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
      await migrate(database, { migrationsFolder: migrations });
      await migrate(database, { migrationsFolder: migrations });
      const [ledger] = await raw`select count(*)::int as count from drizzle.__drizzle_migrations`;
      expect(ledger.count).toBe(4);
      expect((await raw`select to_regclass('public.registration') as table_name`)[0].table_name).toBeNull();
      if (index === 1) {
        expect((await raw`select title from workshop where slug = 'corporate-migration-sentinel'`)[0].title).toBe("Preserved workshop");
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
    }
  });

  it("allows only corporate email kinds and requires an inquiry owner", async () => {
    const kinds = await sql`select enumlabel from pg_enum where enumtypid = 'crm_email_kind'::regtype order by enumsortorder`;
    expect(kinds.map(row => row.enumlabel)).toEqual(["corporate_acknowledgment", "corporate_notification", "corporate_overdue"]);
    const columns = await sql`select column_name from information_schema.columns
      where table_name in ('crm_email_job', 'crm_submission_key') and column_name = 'registration_id'`;
    expect(columns).toHaveLength(0);
    await expect(sql`insert into crm_email_job (kind, payload) values ('corporate_notification', '{}'::jsonb)`)
      .rejects.toSatisfy(error => code(error) === "23502");
    await expect(sql`insert into crm_submission_key (key, payload_hash) values (${randomUUID()}, ${"a".repeat(64)})`)
      .rejects.toSatisfy(error => code(error) === "23502");
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

});
