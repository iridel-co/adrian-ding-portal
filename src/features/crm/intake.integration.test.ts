import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";

vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("./email", () => ({ sendEmailJob: vi.fn() }));
vi.mock("@/db", () => ({ getDb: () => { throw new Error("Integration tests must inject the isolated database"); } }));
vi.mock("@/features/media/r2", () => ({ publicMediaUrl: (key: string) => `https://qr.example.com/${key}`, readPaymentQr: async () => ({ filename: "payment-qr.png", content: "synthetic-base64", contentType: "image/png" }) }));

import { account, activityLog, corporateInquiry, crmEmailJob, crmSubmissionKey, media, paymentAccount, registration, relations, taxonomyTerm, user, workshop, workshopSession, workshopTag } from "@/db/schema";
import { updateSession } from "@/features/sessions/service";
import { updateWorkshop } from "@/features/workshops/service";
import { isCourseCodeLocked } from "@/features/workshops/course-code-lock";
import { handleSubmission } from "./http";
import { authorizeStaff, handleStaffRequest } from "./staff-http";
import { changeRegistration } from "./staff";
import { handleSessionLookup } from "./session-lookup";
import type { CrmEnv } from "@/lib/env";

// Opt in explicitly. DATABASE_URL alone never causes this test to connect.
const isolatedUrl = process.env.CRM_INTEGRATION_DATABASE_URL;
describe.skipIf(!isolatedUrl)("CRM intake in isolated Postgres", () => {
  if (isolatedUrl) {
    const url = new URL(isolatedUrl);
    if (url.hostname !== "127.0.0.1" || url.port !== "55432" || url.pathname !== "/adrian_ding_crm_test") {
      throw new Error("Refusing to test outside the Docker CRM database");
    }
  }
  const client = postgres(isolatedUrl ?? "postgres://unused@127.0.0.1:55432/adrian_ding_crm_test", { max: 8, prepare: false });
  const db = drizzle({ client, relations });
  const workshopId = randomUUID();
  const actorId = `crm-intake-${randomUUID()}`;
  const actor = { id: actorId, name: "Integration Check", email: `${actorId}@example.com` };
  const paymentId = randomUUID();
  const mediaId = randomUUID();
  const termId = randomUUID();
  const config: CrmEnv = { CRM_INTAKE_ENABLED: true, SITE_ORIGINS: ["http://localhost:3001"], PAYMENT_ACCOUNT_ID: paymentId,
    RESEND_API_KEY: "synthetic", EMAIL_FROM: "CRM Test <crm@example.com>", EMAIL_REPLY_TO: "team@example.com", CORPORATE_INQUIRY_RECIPIENTS: ["team@example.com"] };
  const base = { fullName: "  Maria Santos  ", email: `${actorId}@example.com`, phone: "+63 (917) 123-4567", occupation: "Engineer", salaryRange: "Prefer not to say", consent: true };
  const inquiry = { fullName: "Maria Santos", email: base.email, phone: base.phone, consent: true, company: "Example Co", role: "HR Manager", program: "Help us scope it", attendees: "16 to 30", targetDate: "Q1 2030, flexible", venue: "Our Cebu office", context: "First line\nSecond line", alsoInterested: ["Leadership", "Communication"] };
  const sessionIds: string[] = [];
  const inquiryIds: string[] = [];
  async function session(capacity = 1, overrides: Partial<typeof workshopSession.$inferInsert> = {}) {
    const id = randomUUID(); sessionIds.push(id);
    await db.insert(workshopSession).values({ id, workshopId, date: "2030-01-01", endDate: "2030-01-01", startTime: "09:00", endTime: "17:00", venueName: "Test venue", city: "Cebu", priceCentavos: 12345, capacity, status: "open", ...overrides });
    return id;
  }
  async function submit(body: unknown, key: string = randomUUID(), kind: "registration" | "corporate" = "registration", settings = config) {
    return handleSubmission(new Request(`http://localhost/api/${kind === "registration" ? "registrations" : "corporate-inquiries"}`, {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": key, origin: config.SITE_ORIGINS[0] }, body: JSON.stringify(body)
    }), kind, { db, config: settings });
  }
  async function registrations(id: string) { return db.select().from(registration).where(eq(registration.workshopSessionId, id)); }
  async function jobs(id: string) { return db.select().from(crmEmailJob).where(eq(crmEmailJob.registrationId, id)); }
  async function cancel(id: string) { await db.update(registration).set({ cancelledAt: new Date(), cancellationReason: "Synthetic cancellation" }).where(eq(registration.id, id)); }
  beforeAll(async () => {
    const migrationClient = postgres(isolatedUrl!, { max: 1 });
    try { await migrate(drizzle({ client: migrationClient }), { migrationsFolder: "./drizzle" }); } finally { await migrationClient.end(); }
    await db.insert(user).values({ id: actorId, name: actor.name, email: actor.email, emailVerified: true });
    await db.insert(media).values({ id: mediaId, key: `${actorId}/qr.png`, fileName: "qr.png", contentType: "image/png", sizeBytes: 100 });
    await db.insert(taxonomyTerm).values({ id: termId, kind: "workshop_tag", name: actorId });
    await db.insert(workshop).values({ id: workshopId, slug: actorId, title: "Synthetic workshop", courseCode: "CRMTEST", status: "published",
      summary: "Test summary", intro: "Test introduction", heroMediaId: mediaId, defaultPriceCentavos: 12345, defaultCapacity: 2,
      outcomes: ["Test outcome"], curriculum: ["Test curriculum"] });
    await db.insert(workshopTag).values({ workshopId, termId });
    await db.insert(paymentAccount).values({ id: paymentId, method: "bank", providerName: "Synthetic Bank", accountName: "Integration Check", accountNumber: "TEST-ONLY", qrMediaId: mediaId });
  });
  afterAll(async () => {
    try {
      const rows = sessionIds.length ? await db.select({ id: registration.id }).from(registration).where(inArray(registration.workshopSessionId, sessionIds)) : [];
      const ids = rows.map(row => row.id);
      // Corporate rows always use this run's synthetic email, including failed test cases.
      const leads = await db.select({ id: corporateInquiry.id }).from(corporateInquiry).where(eq(corporateInquiry.email, base.email));
      inquiryIds.push(...leads.map(row => row.id));
      if (ids.length) {
        await db.delete(crmSubmissionKey).where(inArray(crmSubmissionKey.registrationId, ids));
        await db.delete(crmEmailJob).where(inArray(crmEmailJob.registrationId, ids));
        await db.delete(registration).where(inArray(registration.id, ids));
      }
      if (inquiryIds.length) {
        await db.delete(crmSubmissionKey).where(inArray(crmSubmissionKey.corporateInquiryId, inquiryIds));
        await db.delete(crmEmailJob).where(inArray(crmEmailJob.corporateInquiryId, inquiryIds));
        await db.delete(corporateInquiry).where(inArray(corporateInquiry.id, inquiryIds));
      }
      await db.delete(activityLog).where(eq(activityLog.userId, actorId));
      if (sessionIds.length) await db.delete(workshopSession).where(inArray(workshopSession.id, sessionIds));
      await db.delete(workshop).where(eq(workshop.id, workshopId));
      await db.delete(taxonomyTerm).where(eq(taxonomyTerm.id, termId));
      await db.delete(paymentAccount).where(eq(paymentAccount.id, paymentId));
      await db.delete(media).where(eq(media.id, mediaId));
      await db.delete(user).where(eq(user.id, actorId));
    } finally { await client.end(); }
  });

  it("saves authoritative price, consent and an immutable email; retries do not overwrite or requeue", async () => {
    const id = await session(); const key = randomUUID();
    const first = await submit({ ...base, workshopSessionId: id.toUpperCase(), email: base.email.toUpperCase(), city: "  " }, key.toUpperCase());
    expect(first.status).toBe(202); expect(await first.json()).toEqual({ accepted: true });
    const [row] = await registrations(id);
    expect(row).toMatchObject({ fullName: "Maria Santos", email: base.email, city: null, priceCentavos: 12345, paymentStatus: "unpaid", occupation: base.occupation, salaryRange: base.salaryRange });
    expect(row.consentAt).toBeInstanceOf(Date);
    const [job] = await jobs(row.id);
    expect(job.state).toBe("pending"); expect(job.payload.to).toEqual([base.email]);
    expect(job.payload.text).toContain(row.id); expect(job.payload.text).toContain("₱123.45");
    expect(job.payload.html).toContain("https://qr.example.com/");
    expect((await submit({ ...base, workshopSessionId: id }, key)).status).toBe(202);
    expect((await submit({ ...base, workshopSessionId: id, fullName: "Changed Name" }, key)).status).toBe(409);
    const newKey = randomUUID();
    expect((await submit({ ...base, workshopSessionId: id, fullName: "Different Details" }, newKey)).status).toBe(202);
    expect((await registrations(id))[0].fullName).toBe("Maria Santos"); expect(await jobs(row.id)).toHaveLength(1);
    expect((await submit({ ...base, workshopSessionId: id, fullName: "Different Details" }, newKey)).status).toBe(202);
    expect((await submit({ ...base, workshopSessionId: id, fullName: "Another Name" }, newKey)).status).toBe(409);
    await db.update(workshopSession).set({ status: "closed" }).where(eq(workshopSession.id, id));
    expect((await submit({ ...base, workshopSessionId: id }, key)).status).toBe(202);
  });

  it("accepts exactly one of two concurrent last-seat requests and one record for concurrent duplicate keys", async () => {
    const id = await session();
    const results = await Promise.all([0, 1].map(i => submit({ ...base, workshopSessionId: id, email: `race${i}-${base.email}` })));
    expect(results.map(response => response.status).sort()).toEqual([202, 409]); expect(await registrations(id)).toHaveLength(1);
    const same = await session(2); const key = randomUUID();
    expect((await Promise.all([0, 1].map(() => submit({ ...base, workshopSessionId: same }, key)))).map(response => response.status)).toEqual([202, 202]);
    const [row] = await registrations(same); expect(await registrations(same)).toHaveLength(1); expect(await jobs(row.id)).toHaveLength(1);
    const duplicate = await session();
    expect((await Promise.all([0, 1].map(() => submit({ ...base, workshopSessionId: duplicate })))).map(response => response.status)).toEqual([202, 202]);
    expect(await registrations(duplicate)).toHaveLength(1);
  });

  it("refuses unavailable sessions, unpublished workshops, bad QR settings and rolls back a failed email-job insert", async () => {
    for (const overrides of [{ status: "closed" as const }, { date: "2000-01-01", endDate: "2000-01-01" }, { registrationCutoffAt: new Date(0) }]) {
      const id = await session(1, overrides); expect((await submit({ ...base, workshopSessionId: id })).status).toBe(409); expect(await registrations(id)).toHaveLength(0);
    }
    expect((await submit({ ...base, workshopSessionId: randomUUID() })).status).toBe(409);
    const id = await session();
    await db.update(workshop).set({ status: "draft" }).where(eq(workshop.id, workshopId));
    expect((await submit({ ...base, workshopSessionId: id })).status).toBe(409);
    await db.update(workshop).set({ status: "published" }).where(eq(workshop.id, workshopId));
    expect((await submit({ ...base, workshopSessionId: id }, randomUUID(), "registration", { ...config, PAYMENT_ACCOUNT_ID: randomUUID() })).status).toBe(503);
    await db.update(media).set({ archivedAt: new Date() }).where(eq(media.id, mediaId));
    expect((await submit({ ...base, workshopSessionId: id })).status).toBe(503);
    await db.update(media).set({ archivedAt: null }).where(eq(media.id, mediaId));
    const key = randomUUID();
    // Force job storage to fail after the registration insert, inside the real
    // transaction, and verify that no registration or request receipt survives.
    const insert = db.transaction.bind(db);
    const sabotaged = { ...db, transaction: (callback: Parameters<typeof db.transaction>[0]) => insert(async tx => {
      const original = tx.insert.bind(tx);
      vi.spyOn(tx, "insert").mockImplementation(((table: unknown) => {
        if (table === crmEmailJob) throw new Error("Synthetic job storage failure");
        return original(table as typeof registration);
      }) as typeof tx.insert);
      return callback(tx);
    }) };
    const response = await handleSubmission(new Request("http://localhost/api/registrations", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify({ ...base, workshopSessionId: id }) }), "registration", { db: sabotaged as typeof db, config });
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: { code: "intake_unavailable" } });
    expect(await registrations(id)).toHaveLength(0); expect(await db.select().from(crmSubmissionKey).where(eq(crmSubmissionKey.key, key))).toHaveLength(0);
  });

  it("cancellation frees the seat; an old key never recreates its cancelled signup", async () => {
    const id = await session(); const key = randomUUID();
    expect((await submit({ ...base, workshopSessionId: id }, key)).status).toBe(202);
    const [row] = await registrations(id); await cancel(row.id);
    expect((await submit({ ...base, workshopSessionId: id }, key)).status).toBe(202);
    expect(await registrations(id)).toHaveLength(1);
    expect((await submit({ ...base, workshopSessionId: id })).status).toBe(202);
    expect(await registrations(id)).toHaveLength(2);
    expect(await db.select().from(registration).where(and(eq(registration.workshopSessionId, id), isNull(registration.cancelledAt)))).toHaveLength(1);
  });

  it("saves corporate answers and two jobs, deduplicates keys, and permits a separate fresh inquiry", async () => {
    const key = randomUUID();
    const outcomes = await Promise.all([0, 1].map(() => submit(inquiry, key, "corporate")));
    expect(outcomes.map(response => response.status)).toEqual([202, 202]);
    const [receipt] = await db.select().from(crmSubmissionKey).where(eq(crmSubmissionKey.key, key));
    const [lead] = await db.select().from(corporateInquiry).where(eq(corporateInquiry.id, receipt.corporateInquiryId!));
    expect(lead).toMatchObject({ company: inquiry.company, role: inquiry.role, phone: inquiry.phone, context: inquiry.context, alsoInterested: inquiry.alsoInterested, targetDate: inquiry.targetDate, attendees: inquiry.attendees });
    const emails = await db.select().from(crmEmailJob).where(eq(crmEmailJob.corporateInquiryId, lead.id));
    expect(emails).toHaveLength(2); expect(emails.find(job => job.kind === "corporate_notification")!.payload.to).toEqual(config.CORPORATE_INQUIRY_RECIPIENTS);
    expect((await submit({ ...inquiry, role: "Director" }, key, "corporate")).status).toBe(409);
    expect((await submit(inquiry, randomUUID(), "corporate")).status).toBe(202);
    expect((await submit({ ...base, workshopSessionId: await session() }, key)).status).toBe(409);
    expect((await db.select().from(corporateInquiry).where(eq(corporateInquiry.email, base.email))).length).toBe(2);
  });

  it("enforces the CMS course-code and capacity rules through their actual update services", async () => {
    const id = await session(2);
    for (const prefix of ["first", "second"]) expect((await submit({ ...base, email: `${prefix}-${base.email}`, workshopSessionId: id })).status).toBe(202);
    expect(await isCourseCodeLocked(db, workshopId)).toBe(true);
    const [current] = await db.select().from(workshop).where(eq(workshop.id, workshopId));
    await expect(updateWorkshop(db, actor, { id: workshopId, values: { ...current, courseCode: "NEWCODE", tagIds: [termId] } })).rejects.toThrow(/locked/);
    const [run] = await db.select().from(workshopSession).where(eq(workshopSession.id, id));
    await expect(updateSession(db, actor, { id, values: { ...run, capacity: 1, registrationCutoff: null } })).rejects.toThrow(/Capacity/);
    await updateSession(db, actor, { id, values: { ...run, capacity: 2, registrationCutoff: null } });
    expect((await db.select({ capacity: workshopSession.capacity }).from(workshopSession).where(eq(workshopSession.id, id)))[0].capacity).toBe(2);
    // Ensure no unrelated synthetic row was created as a result of a rejected edit.
    const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(workshop).where(eq(workshop.id, workshopId));
    expect(count).toBe(1);
  });

  it("coordinates concurrent CMS edits with intake and unlocks the course code after all signups are cancelled", async () => {
    const existing = await db.select({ id: registration.id }).from(registration)
      .innerJoin(workshopSession, eq(workshopSession.id, registration.workshopSessionId))
      .where(and(eq(workshopSession.workshopId, workshopId), isNull(registration.cancelledAt)));
    for (const row of existing) await cancel(row.id);
    expect(await isCourseCodeLocked(db, workshopId)).toBe(false);
    const id = await session(2);
    const [current] = await db.select().from(workshop).where(eq(workshop.id, workshopId));
    const outcomes = await Promise.allSettled([
      updateWorkshop(db, actor, { id: workshopId, values: { ...current, courseCode: "NEWCODE", tagIds: [termId] } }),
      submit({ ...base, workshopSessionId: id })
    ]);
    expect(outcomes[1].status).toBe("fulfilled");
    if (outcomes[1].status === "fulfilled") expect(outcomes[1].value.status).toBe(202);
    const [saved] = await registrations(id);
    const [job] = await jobs(saved.id);
    const [updated] = await db.select().from(workshop).where(eq(workshop.id, workshopId));
    if (outcomes[0].status === "fulfilled") {
      expect(updated.courseCode).toBe("NEWCODE"); expect(job.payload.text).toContain(`NEWCODE-${saved.id}`);
    } else {
      expect(outcomes[0].reason.message).toMatch(/locked/); expect(updated.courseCode).toBe("CRMTEST");
      expect(job.payload.text).toContain(`CRMTEST-${saved.id}`);
    }
    const [run] = await db.select().from(workshopSession).where(eq(workshopSession.id, id));
    const capacityRace = await Promise.allSettled([
      updateSession(db, actor, { id, values: { ...run, capacity: 1, registrationCutoff: null } }),
      submit({ ...base, email: `capacity-${base.email}`, workshopSessionId: id })
    ]);
    const [final] = await db.select().from(workshopSession).where(eq(workshopSession.id, id));
    const active = (await registrations(id)).filter(row => row.cancelledAt === null);
    expect(active.length).toBeLessThanOrEqual(final.capacity);
    expect(capacityRace.some(result => result.status === "fulfilled")).toBe(true);
  });
  it("requires current verified Google staff membership and rejects cross-origin mutations", async () => {
    const googleId = randomUUID();
    await db.insert(account).values({ id: googleId, userId: actorId, accountId: actorId, providerId: "google" });
    const dependencies = { db, userId: actorId, adminEmails: ` ${actor.email.toUpperCase()} `, portalUrl: "http://localhost:3000" };
    const request = (method = "GET", origin?: string, body?: unknown) => new Request("http://localhost:3000/api/crm/corporate-inquiries", {
      method, headers: { ...(origin ? { origin } : {}), "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {})
    });
    try {
      expect((await handleStaffRequest(request(), { ...dependencies, userId: undefined })).status).toBe(401);
      expect((await handleStaffRequest(request(), { ...dependencies, adminEmails: "" })).status).toBe(403);
      expect((await handleStaffRequest(request())).status).toBe(503); // No injected DB may reach production.
      expect((await handleStaffRequest(request(), dependencies)).status).toBe(200);
      expect((await handleStaffRequest(request("POST", "https://attacker.example", {}), dependencies)).status).toBe(403);
      expect((await handleStaffRequest(request("POST", undefined, {}), dependencies)).status).toBe(403);
      expect((await handleStaffRequest(request("GET", "https://attacker.example"), dependencies)).status).toBe(403);
      await db.update(user).set({ emailVerified: false }).where(eq(user.id, actorId));
      await expect(authorizeStaff(db, actorId, actor.email)).rejects.toMatchObject({ status: 403 });
      await db.update(user).set({ emailVerified: true }).where(eq(user.id, actorId));
      await db.delete(account).where(eq(account.id, googleId));
      await expect(authorizeStaff(db, actorId, actor.email)).rejects.toMatchObject({ status: 403 });
    } finally {
      await db.update(user).set({ emailVerified: true }).where(eq(user.id, actorId));
      await db.delete(account).where(eq(account.id, googleId));
    }
  });

  it("audits payment/cancellation atomically, preserves identity after deletion, and releases the seat", async () => {
    const id = await session();
    expect((await submit({ ...base, workshopSessionId: id })).status).toBe(202);
    const [row] = await registrations(id);
    const payment = (paymentStatus: "paid" | "unpaid", expectedPaymentStatus: "paid" | "unpaid", reason?: string) =>
      changeRegistration(db, row.id, actor, { kind: "payment", input: { paymentStatus, expectedPaymentStatus, reason } });
    expect(await payment("paid", "unpaid")).toEqual({ changed: true });
    expect(await payment("paid", "unpaid")).toEqual({ changed: false });
    expect((await jobs(row.id))[0].state).toBe("skipped");
    await expect(changeRegistration(db, row.id, actor, { kind: "cancel", input: { reason: "Test" } })).rejects.toMatchObject({ status: 409 });
    await expect(payment("unpaid", "unpaid", "Stale" )).rejects.toMatchObject({ code: "payment_status_changed" });
    await expect(payment("unpaid", "paid")).rejects.toMatchObject({ code: "reason_required" });
    await payment("unpaid", "paid", "Payment corrected");
    // A failed audit must roll back the state change and job updates.
    await expect(changeRegistration(db, row.id, { ...actor, id: "missing-staff-user" }, { kind: "payment", input: { paymentStatus: "paid", expectedPaymentStatus: "unpaid" } })).rejects.toThrow();
    expect((await registrations(id))[0].paymentStatus).toBe("unpaid");
    const removedActor = { id: randomUUID(), name: "Removed staff", email: "removed-staff@example.com" };
    await db.insert(user).values({ ...removedActor, emailVerified: true });
    try {
      await changeRegistration(db, row.id, removedActor, { kind: "cancel", input: { reason: "Seat released" } });
      expect(await changeRegistration(db, row.id, actor, { kind: "cancel", input: { reason: "Repeated" } })).toEqual({ changed: false });
      await db.delete(user).where(eq(user.id, removedActor.id));
      const history = await db.select().from(activityLog).where(and(eq(activityLog.entityType, "registration"), eq(activityLog.entityId, row.id)));
      expect(history).toHaveLength(3);
      const cancellation = history.find(entry => entry.changes.cancelledAt);
      expect(cancellation?.userId).toBeNull();
      expect(cancellation?.changes.actor.to).toEqual(removedActor);
      expect((await registrations(id))[0].cancelledBy).toBeNull();
      expect((await submit({ ...base, workshopSessionId: id, email: `replacement-${base.email}` })).status).toBe(202);
      await expect(payment("paid", "unpaid")).rejects.toMatchObject({ code: "registration_cancelled" });
    } finally {
      await db.delete(activityLog).where(and(eq(activityLog.entityType, "registration"), eq(activityLog.entityId, row.id)));
      await db.delete(user).where(eq(user.id, removedActor.id));
    }
  });

  it("serves bounded staff records/history and rejects forged mutation fields", async () => {
    const googleId = randomUUID();
    await db.insert(account).values({ id: googleId, userId: actorId, accountId: actorId, providerId: "google" });
    const dependencies = { db, userId: actorId, adminEmails: actor.email, portalUrl: "http://localhost:3000", apiKey: "synthetic" };
    const call = (path: string, method = "GET", body?: unknown) => handleStaffRequest(new Request(`http://localhost:3000/api/crm/${path}`, {
      method, headers: { origin: dependencies.portalUrl, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {})
    }), dependencies);
    try {
      const id = await session(2);
      await submit({ ...base, workshopSessionId: id });
      await submit({ ...base, workshopSessionId: id, email: `page-${base.email}` });
      const [row] = await registrations(id);
      const page = await (await call(`registrations?workshopSessionId=${id}&limit=1`)).json();
      expect(page.items).toHaveLength(1); expect(page.hasMore).toBe(true);
      expect(page.items[0]).not.toHaveProperty("payloadHash"); expect(page.items[0]).not.toHaveProperty("idempotencyKey");
      expect((await call(`registrations?workshopSessionId=${id}&limit=101`)).status).toBe(400);
      expect((await call("registrations/bad-id")).status).toBe(400);
      expect((await call(`registrations/${randomUUID()}`)).status).toBe(404);
      expect((await call(`registrations/${row.id}/payment`, "PATCH", { paymentStatus: "paid", expectedPaymentStatus: "unpaid", priceCentavos: 1 })).status).toBe(400);
      expect((await call(`registrations/${row.id}/payment`, "PATCH", { paymentStatus: "paid", expectedPaymentStatus: "unpaid" })).status).toBe(200);
      const detail = await (await call(`registrations/${row.id}`)).json();
      expect(detail.paymentStatus).toBe("paid"); expect(detail.history).toHaveLength(1);
      expect(detail.emailJobs[0]).not.toHaveProperty("payload");
      expect((await call(`emails/${detail.emailJobs[0].id}/retry`, "POST", {})).status).toBe(200);
      const leads = await (await call("corporate-inquiries?limit=1")).json();
      expect(leads.items).toHaveLength(1); expect(leads.items[0].emailJobs).toHaveLength(2);
      expect(leads.items[0]).not.toHaveProperty("payloadHash");
    } finally { await db.delete(account).where(eq(account.id, googleId)); }
  });

  it("serializes racing payment and cancellation so a paid seat cannot be released", async () => {
    const id = await session();
    await submit({ ...base, workshopSessionId: id });
    const [row] = await registrations(id);
    const results = await Promise.allSettled([
      changeRegistration(db, row.id, actor, { kind: "payment", input: { paymentStatus: "paid", expectedPaymentStatus: "unpaid" } }),
      changeRegistration(db, row.id, actor, { kind: "cancel", input: { reason: "Concurrent cancellation" } })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const [saved] = await registrations(id);
    expect(saved.cancelledAt ? saved.paymentStatus === "unpaid" : saved.paymentStatus === "paid").toBe(true);
    const history = await db.select().from(activityLog).where(and(eq(activityLog.entityType, "registration"), eq(activityLog.entityId, row.id)));
    expect(history).toHaveLength(1);
  });

  it("looks up only published open future sessions, with bounded public fields and sold-out availability", async () => {
    const now = new Date("2030-01-01T01:00:00Z"); // 09:00 in Manila, exactly the default start.
    const full = await session(1, { date: "2030-01-02", endDate: "2030-01-02" });
    const today = await session(1, { startTime: "10:00", registrationCutoffAt: new Date(now.getTime() + 1000) });
    await session(1, { status: "draft", date: "2030-01-02", endDate: "2030-01-02" });
    await session(1, { status: "closed", date: "2030-01-02", endDate: "2030-01-02" });
    await session(1, { status: "cancelled", date: "2030-01-02", endDate: "2030-01-02" });
    await session(1, { startTime: "11:00", registrationCutoffAt: now });
    expect((await submit({ ...base, workshopSessionId: full })).status).toBe(202);
    const [saved] = await registrations(full);
    await db.update(registration).set({ paymentStatus: "paid" }).where(eq(registration.id, saved.id));
    const lookup = (query = `workshopSlug=${actorId}`) => handleSessionLookup(new Request(`http://localhost/api/workshop-sessions?${query}`, {
      headers: { origin: config.SITE_ORIGINS[0] }
    }), { db, origins: config.SITE_ORIGINS, now });
    const response = await lookup();
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.timeZone).toBe("Asia/Manila"); expect(body.hasMore).toBe(false);
    expect(body.items.map((row: { id: string }) => row.id)).toEqual([today, full]);
    expect(body.items[0]).toMatchObject({ workshopSlug: actorId, priceCentavos: 12345, available: true });
    expect(body.items[1].available).toBe(false);
    expect(JSON.stringify(body)).not.toContain(base.email);
    expect(body.items[0]).not.toHaveProperty("capacity"); expect(body.items[0]).not.toHaveProperty("createdBy");
    const firstPage = await (await lookup(`workshopSlug=${actorId}&limit=1`)).json();
    expect(firstPage.items[0].id).toBe(today); expect(firstPage.hasMore).toBe(true);
    const secondPage = await (await lookup(`workshopSlug=${actorId}&limit=1&offset=1`)).json();
    expect(secondPage.items[0].id).toBe(full); expect(secondPage.hasMore).toBe(false);
    await db.update(registration).set({ paymentStatus: "unpaid" }).where(eq(registration.id, saved.id));
    await cancel(saved.id);
    expect((await (await lookup()).json()).items[1].available).toBe(true);
    expect((await (await lookup("workshopSlug=unknown-workshop")).json()).items).toEqual([]);
    await db.update(workshop).set({ status: "draft" }).where(eq(workshop.id, workshopId));
    try { expect((await (await lookup()).json()).items).toEqual([]); }
    finally { await db.update(workshop).set({ status: "published" }).where(eq(workshop.id, workshopId)); }
  });
});
