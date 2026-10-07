import "@tanstack/react-start/server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { z } from "zod";
import { activityLog, corporateInquiry, crmEmailJob, registration, workshop, workshopSession } from "@/db/schema";
import type { Db } from "@/db";
import { logActivity } from "@/features/shared/audit";
import { IntakeError } from "./service";

export type StaffActor = { id: string; name: string; email: string };
const status = z.enum(["unpaid", "paid"]);
export const paymentChangeSchema = z.strictObject({ paymentStatus: status, expectedPaymentStatus: status, reason: z.string().trim().min(1).max(2000).optional() });
export const cancellationSchema = z.strictObject({ reason: z.string().trim().min(1).max(2000) });
export const pageSchema = z.strictObject({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).max(100000).default(0) });
const { idempotencyKey: _registrationKey, payloadHash: _registrationHash, ...registrationFields } = getTableColumns(registration);
const { idempotencyKey: _inquiryKey, payloadHash: _inquiryHash, ...inquiryFields } = getTableColumns(corporateInquiry);
const { payload: _payload, ...jobFields } = getTableColumns(crmEmailJob);

export async function listRegistrations(db: Db, sessionId: string, page: z.output<typeof pageSchema>) {
  const rows = await db.select(registrationFields).from(registration).where(eq(registration.workshopSessionId, sessionId))
    .orderBy(desc(registration.createdAt), desc(registration.id)).limit(page.limit + 1).offset(page.offset);
  return { items: rows.slice(0, page.limit), hasMore: rows.length > page.limit };
}

export async function listInquiries(db: Db, page: z.output<typeof pageSchema>) {
  const rows = await db.select(inquiryFields).from(corporateInquiry).orderBy(desc(corporateInquiry.createdAt), desc(corporateInquiry.id)).limit(page.limit + 1).offset(page.offset);
  const items = rows.slice(0, page.limit);
  const jobs = items.length ? await db.select(jobFields).from(crmEmailJob).where(inArray(crmEmailJob.corporateInquiryId, items.map(row => row.id))) : [];
  return { items: items.map(row => ({ ...row, emailJobs: jobs.filter(job => job.corporateInquiryId === row.id) })), hasMore: rows.length > page.limit };
}

export async function registrationDetail(db: Db, id: string, page: z.output<typeof pageSchema>) {
  const [row] = await db.select(registrationFields).from(registration).where(eq(registration.id, id));
  if (!row) throw new IntakeError(404, "registration_not_found");
  const history = await db.select().from(activityLog).where(and(eq(activityLog.entityType, "registration"), eq(activityLog.entityId, id)))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(page.limit + 1).offset(page.offset);
  const emailJobs = await db.select(jobFields).from(crmEmailJob).where(eq(crmEmailJob.registrationId, id));
  return { ...row, emailJobs, history: history.slice(0, page.limit), historyHasMore: history.length > page.limit };
}

export async function changeRegistration(db: Db, id: string, actor: StaffActor,
  change: { kind: "payment"; input: z.output<typeof paymentChangeSchema> } | { kind: "cancel"; input: z.output<typeof cancellationSchema> }) {
  return db.transaction(async tx => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    await tx.execute(sql`set local statement_timeout = '10s'`);
    const [lookup] = await tx.select({ sessionId: registration.workshopSessionId, workshopId: workshopSession.workshopId }).from(registration)
      .innerJoin(workshopSession, eq(workshopSession.id, registration.workshopSessionId)).where(eq(registration.id, id));
    if (!lookup) throw new IntakeError(404, "registration_not_found");
    await tx.select({ id: workshop.id }).from(workshop).where(eq(workshop.id, lookup.workshopId)).for("share");
    await tx.select({ id: workshopSession.id }).from(workshopSession).where(eq(workshopSession.id, lookup.sessionId)).for("update");
    const [row] = await tx.select().from(registration).where(eq(registration.id, id)).for("update");
    if (!row) throw new IntakeError(404, "registration_not_found");
    const changes: Parameters<typeof logActivity>[1]["changes"] = {
      actor: { from: null, to: { id: actor.id, name: actor.name, email: actor.email } }
    };
    if (change.kind === "cancel") {
      if (row.cancelledAt) return { changed: false };
      if (row.paymentStatus !== "unpaid") throw new IntakeError(409, "paid_registration_cannot_cancel");
      const [updated] = await tx.update(registration).set({ cancelledAt: sql`clock_timestamp()`, cancelledBy: actor.id, cancellationReason: change.input.reason }).where(eq(registration.id, id)).returning();
      changes.cancelledAt = { from: null, to: updated.cancelledAt };
      changes.reason = { from: null, to: change.input.reason };
    } else {
      const input = change.input;
      if (row.cancelledAt) throw new IntakeError(409, "registration_cancelled");
      if (row.paymentStatus === input.paymentStatus) return { changed: false };
      if (row.paymentStatus !== input.expectedPaymentStatus) throw new IntakeError(409, "payment_status_changed");
      if (input.paymentStatus === "unpaid" && !input.reason) throw new IntakeError(400, "reason_required");
      await tx.update(registration).set({ paymentStatus: input.paymentStatus }).where(eq(registration.id, id));
      changes.paymentStatus = { from: row.paymentStatus, to: input.paymentStatus };
      changes.reason = { from: null, to: input.reason ?? null };
    }
    // A claimed send may already be with the provider. Do not erase its outcome.
    if (change.kind === "cancel" || change.input.paymentStatus === "paid") {
      await tx.update(crmEmailJob).set({ state: "skipped", lastErrorCode: "payment_instructions_obsolete" })
        .where(and(eq(crmEmailJob.registrationId, id), inArray(crmEmailJob.state, ["pending", "failed"])));
    }
    await logActivity(tx, { userId: actor.id, action: "status_change", entityType: "registration", entityId: id, changes });
    return { changed: true };
  });
}

export async function emailJobDetail(db: Db, id: string) {
  const [job] = await db.select(jobFields).from(crmEmailJob).where(eq(crmEmailJob.id, id));
  if (!job) throw new IntakeError(404, "email_job_not_found");
  return job;
}
