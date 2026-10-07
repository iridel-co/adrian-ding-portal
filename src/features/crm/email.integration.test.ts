import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const { readQr } = vi.hoisted(() => ({ readQr: vi.fn(async () => ({ filename: "payment-qr.png", content: "iVBORw0KGgo=", contentType: "image/png" })) }));
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: () => { throw new Error("Use only the injected Docker database"); } }));
vi.mock("@/features/media/r2", () => ({ publicMediaUrl: (key: string) => `https://qr.example.com/${key}`, readPaymentQr: readQr }));
import { corporateInquiry, crmEmailJob, crmSubmissionKey, media, paymentAccount, registration, relations, workshop, workshopSession } from "@/db/schema";
import { sendEmailJob, type EmailTransport } from "./email";
import { acceptCorporateInquiry, acceptRegistration } from "./service";
import { corporateInquirySchema, registrationSchema } from "./schemas";
import { handleSubmission } from "./http";
import type { CrmEnv } from "@/lib/env";

const isolatedUrl = process.env.CRM_INTEGRATION_DATABASE_URL;
describe.skipIf(!isolatedUrl)("CRM email delivery in Docker", () => {
  if (isolatedUrl) {
    const url = new URL(isolatedUrl);
    if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/adrian_ding_crm_test") throw new Error("Refusing to test outside the isolated database");
  }
  const client = postgres(isolatedUrl ?? "postgres://unused@127.0.0.1:55432/adrian_ding_crm_test", { max: 4 });
  const db = drizzle({ client, relations });
  const workshopId = randomUUID(), sessionId = randomUUID(), mediaId = randomUUID(), paymentId = randomUUID();
  const email = `crm-mail-${randomUUID()}@example.com`;
  const config: CrmEnv = { CRM_INTAKE_ENABLED: true, SITE_ORIGINS: ["http://localhost:3001"], PAYMENT_ACCOUNT_ID: paymentId, RESEND_API_KEY: "synthetic-never-used", EMAIL_FROM: "CRM Test <crm@example.com>", EMAIL_REPLY_TO: "team@example.com", CORPORATE_INQUIRY_RECIPIENTS: ["team@example.com"] };
  const inquiry = corporateInquirySchema.parse({ fullName: "Mail Check", email, phone: "+63 917 123 4567", consent: true, company: "Example Co", role: "HR Manager", program: "Leadership", attendees: "16 to 30", targetDate: "Q1 2030", venue: "Our office" });
  const createJobs = () => acceptCorporateInquiry(db, inquiry, randomUUID(), config);
  const getJob = async (id: string) => (await db.select().from(crmEmailJob).where(eq(crmEmailJob.id, id)))[0];
  const capture: EmailTransport = async (payload, key) => {
    // Fixed loopback URL; never send a provider secret to the capture service.
    const response = await fetch("http://127.0.0.1:55825/emails", { method: "POST", redirect: "error", signal: AbortSignal.timeout(10000), headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error("Synthetic transport failure");
    return await response.json() as { id: string };
  };
  beforeAll(async () => {
    const migrationClient = postgres(isolatedUrl!, { max: 1 });
    try { await migrate(drizzle({ client: migrationClient }), { migrationsFolder: "./drizzle" }); } finally { await migrationClient.end(); }
    expect((await fetch("http://127.0.0.1:55825/health")).ok).toBe(true);
    await db.insert(media).values({ id: mediaId, key: `synthetic-${mediaId}.png`, fileName: "qr.png", contentType: "image/png", sizeBytes: 8 });
    await db.insert(paymentAccount).values({ id: paymentId, method: "bank", providerName: "Synthetic Bank", accountName: "Mail Check", accountNumber: "TEST-ONLY", qrMediaId: mediaId });
    await db.insert(workshop).values({ id: workshopId, slug: `mail-${workshopId}`, title: "Synthetic workshop", courseCode: "MAILTEST", status: "published" });
    await db.insert(workshopSession).values({ id: sessionId, workshopId, date: "2030-01-01", endDate: "2030-01-01", startTime: "09:00", endTime: "17:00", venueName: "Test venue", city: "Cebu", priceCentavos: 12345, capacity: 10, status: "open" });
  });
  afterAll(async () => {
    try {
      const leads = await db.select({ id: corporateInquiry.id }).from(corporateInquiry).where(eq(corporateInquiry.email, email));
      const rows = await db.select({ id: registration.id }).from(registration).where(eq(registration.workshopSessionId, sessionId));
      for (const { id } of rows) {
        await db.delete(crmSubmissionKey).where(eq(crmSubmissionKey.registrationId, id));
        await db.delete(crmEmailJob).where(eq(crmEmailJob.registrationId, id));
        await db.delete(registration).where(eq(registration.id, id));
      }
      if (leads.length) {
        const ids = leads.map(row => row.id);
        await db.delete(crmSubmissionKey).where(inArray(crmSubmissionKey.corporateInquiryId, ids));
        await db.delete(crmEmailJob).where(inArray(crmEmailJob.corporateInquiryId, ids));
        await db.delete(corporateInquiry).where(inArray(corporateInquiry.id, ids));
      }
      await db.delete(workshopSession).where(eq(workshopSession.id, sessionId));
      await db.delete(workshop).where(eq(workshop.id, workshopId));
      await db.delete(paymentAccount).where(eq(paymentAccount.id, paymentId));
      await db.delete(media).where(eq(media.id, mediaId));
    } finally { await client.end(); }
  });

  it("sends after commit, preserves saved inquiries on provider failure, and never resends on public replay", async () => {
    const key = randomUUID();
    const failure: EmailTransport = async (payload, jobKey) => {
      // Seeing the job from a separate connection proves the transaction committed.
      expect((await getJob(jobKey)).state).toBe("sending");
      const response = await fetch("http://127.0.0.1:55825/emails", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": jobKey, "X-CRM-Test-Fail": "true" }, body: JSON.stringify(payload) });
      expect(response.status).toBe(503); throw new Error("Synthetic failure including private provider detail");
    };
    const request = () => new Request("http://localhost/api/corporate-inquiries", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify({ ...inquiry, context: "" }) });
    const response = await handleSubmission(request(), "corporate", { db, config, emailTransport: failure });
    expect(response.status).toBe(202); expect(await response.json()).toEqual({ accepted: true });
    const [receipt] = await db.select().from(crmSubmissionKey).where(eq(crmSubmissionKey.key, key));
    const jobs = await db.select().from(crmEmailJob).where(eq(crmEmailJob.corporateInquiryId, receipt.corporateInquiryId!));
    expect(jobs).toHaveLength(2);
    for (const job of jobs) {
      expect(job.state).toBe("failed"); expect(job.lastErrorCode).toBe("provider_request_failed"); expect(job.attemptCount).toBe(1);
      await sendEmailJob(db, job.id, config.RESEND_API_KEY, capture); expect((await getJob(job.id)).state).toBe("sent");
    }
    const shouldNotSend = vi.fn(capture);
    expect((await handleSubmission(request(), "corporate", { db, config, emailTransport: shouldNotSend })).status).toBe(202);
    expect(shouldNotSend).not.toHaveBeenCalled();
  });

  it("reuses identical payload and provider key after an accepted response is lost", async () => {
    const [id] = await createJobs(); const before = await getJob(id); let providerId = "";
    await sendEmailJob(db, id, config.RESEND_API_KEY, async (payload, key) => { providerId = (await capture(payload, key)).id; throw new Error("Synthetic lost response"); });
    expect((await getJob(id)).state).toBe("failed");
    await sendEmailJob(db, id, config.RESEND_API_KEY, capture);
    const sent = await getJob(id); expect(sent.providerId).toBe(providerId); expect(sent.state).toBe("sent"); expect(sent.attemptCount).toBe(2); expect(sent.payload).toEqual(before.payload);
    const noSend = vi.fn(capture); await sendEmailJob(db, id, config.RESEND_API_KEY, noSend); expect(noSend).not.toHaveBeenCalled();
  });

  it("allows one sender, recovers an expired lease, and fences a late response", async () => {
    const [id] = await createJobs(); let complete!: (value: { id: string }) => void; let begun!: () => void;
    const began = new Promise<void>(resolve => { begun = resolve; });
    const pending = sendEmailJob(db, id, config.RESEND_API_KEY, () => { begun(); return new Promise(resolve => { complete = resolve; }); });
    await began;
    const busy = vi.fn(capture); await sendEmailJob(db, id, config.RESEND_API_KEY, busy); expect(busy).not.toHaveBeenCalled();
    await db.update(crmEmailJob).set({ leaseExpiresAt: new Date(0) }).where(eq(crmEmailJob.id, id));
    await sendEmailJob(db, id, config.RESEND_API_KEY, capture);
    const recovered = await getJob(id); expect(recovered.state).toBe("sent"); expect(recovered.attemptCount).toBe(2);
    complete({ id: "late-provider-response" }); await pending;
    expect((await getJob(id)).providerId).toBe(recovered.providerId);
  });

  it("leaves a recoverable claim when recording provider acceptance fails", async () => {
    const [id] = await createJobs();
    const broken = { ...db, transaction: db.transaction.bind(db), update: () => { throw new Error("Synthetic state storage failure"); } };
    await expect(sendEmailJob(broken as unknown as typeof db, id, config.RESEND_API_KEY, capture)).rejects.toThrow(/storage failure/);
    expect((await getJob(id)).state).toBe("sending");
    await db.update(crmEmailJob).set({ leaseExpiresAt: new Date(0) }).where(eq(crmEmailJob.id, id));
    await sendEmailJob(db, id, config.RESEND_API_KEY, capture);
    expect((await getJob(id)).state).toBe("sent"); expect((await getJob(id)).attemptCount).toBe(2);
  });

  it("requires reconciliation for old ambiguous attempts instead of sending again", async () => {
    for (const state of ["sending", "failed"] as const) {
      const [id] = await createJobs();
      // Claims use the database clock; the Docker clock can differ from the host.
      const [{ instant }] = await db.execute<{ instant: string }>(sql`select clock_timestamp() as instant`);
      const old = new Date(new Date(instant).getTime() - (24 * 60 * 60 - 60) * 1000);
      await db.update(crmEmailJob).set({ state, firstAttemptAt: old, lastAttemptAt: old, attemptCount: 1, leaseExpiresAt: state === "sending" ? old : null }).where(eq(crmEmailJob.id, id));
      const noSend = vi.fn(capture); await sendEmailJob(db, id, config.RESEND_API_KEY, noSend);
      expect(noSend).not.toHaveBeenCalled(); expect((await getJob(id)).state).toBe("needs_reconciliation");
    }
  });

  it("snapshots the QR outside locks, rejects an unreadable QR, and skips paid/cancelled instructions", async () => {
    const input = (suffix: string) => registrationSchema.parse({ workshopSessionId: sessionId, fullName: "Mail Check", email: `${suffix}-${email}`, phone: inquiry.phone, occupation: "Engineer", salaryRange: "Prefer not to say", consent: true });
    readQr.mockImplementationOnce(async () => {
      await db.transaction(async tx => { await tx.select({ id: workshopSession.id }).from(workshopSession).where(eq(workshopSession.id, sessionId)).for("update", { noWait: true }); });
      return { filename: "payment-qr.png", content: "iVBORw0KGgo=", contentType: "image/png" };
    });
    const [id] = await acceptRegistration(db, input("qr"), randomUUID(), config);
    const job = await getJob(id); expect(job.payload.attachments?.[0].content).toBe("iVBORw0KGgo=");
    await sendEmailJob(db, id, config.RESEND_API_KEY, capture); expect((await getJob(id)).state).toBe("sent");
    readQr.mockRejectedValueOnce(new Error("Synthetic missing QR"));
    await expect(acceptRegistration(db, input("bad"), randomUUID(), config)).rejects.toThrow(/missing QR/);
    expect(await db.select().from(registration).where(eq(registration.email, `bad-${email}`))).toHaveLength(0);
    for (const suffix of ["paid", "cancelled"]) {
      const [jobId] = await acceptRegistration(db, input(suffix), randomUUID(), config); const emailJob = await getJob(jobId);
      await db.update(registration).set(suffix === "paid" ? { paymentStatus: "paid" } : { cancelledAt: new Date(), cancellationReason: "Synthetic cancellation" }).where(eq(registration.id, emailJob.registrationId!));
      const noSend = vi.fn(capture); await sendEmailJob(db, jobId, config.RESEND_API_KEY, noSend);
      expect(noSend).not.toHaveBeenCalled(); expect((await getJob(jobId)).state).toBe("skipped"); expect((await getJob(jobId)).attemptCount).toBe(0);
    }
  });
});
