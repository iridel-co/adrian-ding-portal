import { randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

vi.mock("@tanstack/react-start/server-only", () => ({}));
import { relations } from "@/db/schema";
import { acceptCorporateInquiry } from "./service";
import { corporateInquirySchema } from "./schemas";

// Explicit opt-in only. Never use DATABASE_URL or the application's DB client.
const isolatedUrl = process.env.CRM_INTEGRATION_DATABASE_URL;
if (isolatedUrl) {
  const url = new URL(isolatedUrl);
  if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/adrian_ding_crm_test") {
    throw new Error("Use only the isolated Docker CRM database at 127.0.0.1:55432/adrian_ding_crm_test");
  }
}

describe.skipIf(!isolatedUrl)("Corporate database foundation", () => {
  const suffix = randomUUID().replaceAll("-", "");
  const databaseNames = [`corp_clean_${suffix}`, `corp_baseline_${suffix}`];
  const admin = postgres(isolatedUrl ?? "postgres://unused@127.0.0.1:55432/adrian_ding_crm_test", { max: 1 });
  const clients: ReturnType<typeof postgres>[] = [];
  let sql: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof relations>>;
  let baselineFolder: string | undefined;
  const createdDatabases: string[] = [];
  const config = { EMAIL_FROM: "Test <test@example.invalid>", EMAIL_REPLY_TO: "sales@example.invalid",
    CORPORATE_INQUIRY_RECIPIENTS: ["primary@example.invalid", "secondary@example.invalid"] };
  const now = new Date("2026-10-16T10:00:00+08:00");
  const input = () => corporateInquirySchema.parse({ fullName: "Synthetic Lead", email: `${randomUUID()}@example.invalid`,
    phone: "+63 917 123 4567", consent: true, company: "Synthetic Company", role: "HR Manager", program: "Leadership",
    attendees: "16 to 30", targetDateFrom: "2027-01-12", targetDateTo: "2027-01-14", venue: "Our office", context: "<script>test</script>" });
  const code = (error: unknown) => {
    const failure = error as { code?: string; cause?: { code?: string } };
    return failure.code ?? failure.cause?.code;
  };

  beforeAll(async () => {
    baselineFolder = await mkdtemp(path.join(tmpdir(), "corporate-migrations-"));
    const migrations = path.resolve("drizzle");
    for (const name of await readdir(migrations)) {
      if (name.endsWith("_corporate_inquiry_lifecycle") || name.endsWith("_corporate_inquiry_dates")
        || name.endsWith("_remove_inquiry_consent_timestamp")) continue;
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
        await raw`insert into workshop (slug, title) values ('corporate-migration-sentinel', 'Preserved workshop')`;
      }
      await migrate(database, { migrationsFolder: migrations });
      await migrate(database, { migrationsFolder: migrations });
      const [ledger] = await raw`select count(*)::int as count from drizzle.__drizzle_migrations`;
      expect(ledger.count).toBe(8);
      if (index === 1) {
        expect((await raw`select title from workshop where slug = 'corporate-migration-sentinel'`)[0].title).toBe("Preserved workshop");
      } else { sql = raw; db = database; }
    }
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

  it("saves NEW, its deadline, receipt and immutable email snapshots atomically", async () => {
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
    expect(row.target_date_from).toBe("2027-01-12");
    expect(row.target_date_to).toBe("2027-01-14");
    expect(row.target_date).toBeNull();
    const jobs = await sql`select * from crm_email_job where corporate_inquiry_id = ${row.id}`;
    expect(jobs.map(job => job.kind).sort()).toEqual(["corporate_acknowledgment", "corporate_notification"]);
    expect(jobs.every(job => job.state === "pending" && job.attempt_count === 0)).toBe(true);
    expect(jobs.find(job => job.kind === "corporate_notification")!.payload.html).toContain("&lt;script&gt;");
    expect((await sql`select corporate_inquiry_id from crm_submission_key where key = ${key}`)[0].corporate_inquiry_id).toBe(row.id);
    await expect(sql`update crm_email_job set payload = '{}'::jsonb where id = ${ids[0]}`).rejects.toSatisfy(error => code(error) === "23514");
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
});
