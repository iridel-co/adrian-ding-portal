import "@tanstack/react-start/server-only";
import { and, desc, eq, getTableColumns, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { activityLog, corporateInquiry, corporateInquiryStatus, crmEmailJob } from "@/db/schema";
import { diffChanges, logActivity } from "@/features/shared/audit";
import type { PortalActor } from "@/lib/access";
import { sendEmailJob, type EmailTransport } from "./email";
import { IntakeError } from "./errors";
import { assertInquiryTransition } from "./lifecycle";
import type { inquiryListSchema, inquiryPageSchema, inquiryTransitionSchema } from "./schemas";

const { idempotencyKey: _key, payloadHash: _hash, ...inquiryFields } = getTableColumns(corporateInquiry);
const emailFields = {
  id: crmEmailJob.id, kind: crmEmailJob.kind, state: crmEmailJob.state, attemptCount: crmEmailJob.attemptCount,
  firstAttemptAt: crmEmailJob.firstAttemptAt, lastAttemptAt: crmEmailJob.lastAttemptAt,
  leaseExpiresAt: crmEmailJob.leaseExpiresAt, sentAt: crmEmailJob.sentAt, lastErrorCode: crmEmailJob.lastErrorCode
};

const change = <T extends z.ZodType>(value: T) => z.object({ from: value.nullable(), to: value.nullable() }).optional();
const historyChangesSchema = z.object({
  status: change(z.enum(corporateInquiryStatus.enumValues)),
  contactedAt: change(z.string()), proposalSentAt: change(z.string()), closedAt: change(z.string()),
  estimatedValueCentavos: change(z.number()), lostReason: change(z.string()),
  actor: change(z.object({ id: z.string(), name: z.string(), email: z.string() })),
  emailRetry: change(z.object({ jobId: z.uuid(), state: z.string(), attemptCount: z.number() }))
});

export async function listInquiries(db: Db, input: z.output<typeof inquiryListSchema>) {
  // Escape SQL wildcard characters so searches match the text the user typed.
  const pattern = `%${input.search.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.select({
    id: corporateInquiry.id, company: corporateInquiry.company,
    fullName: corporateInquiry.fullName, email: corporateInquiry.email, program: corporateInquiry.program,
    createdAt: corporateInquiry.createdAt, status: corporateInquiry.status, slaDueAt: corporateInquiry.slaDueAt
  })
    .from(corporateInquiry).where(and(
      input.status === "all" ? undefined : input.status === "non-spam" ? ne(corporateInquiry.status, "SPAM") : eq(corporateInquiry.status, input.status),
      input.search ? or(ilike(corporateInquiry.fullName, pattern), ilike(corporateInquiry.company, pattern), ilike(corporateInquiry.email, pattern)) : undefined
    )).orderBy(desc(corporateInquiry.createdAt), desc(corporateInquiry.id)).limit(input.limit + 1).offset(input.offset);
  return { items: rows.slice(0, input.limit), hasMore: rows.length > input.limit };
}

export async function inquiryDetail(db: Db, id: string, page: z.output<typeof inquiryPageSchema>) {
  const [inquiry] = await db.select(inquiryFields).from(corporateInquiry).where(eq(corporateInquiry.id, id));
  if (!inquiry) throw new IntakeError(404, "inquiry_not_found");
  const history = await db.select({
    id: activityLog.id, action: activityLog.action,
    createdAt: activityLog.createdAt, changes: activityLog.changes
  }).from(activityLog)
    .where(and(eq(activityLog.entityType, "corporate_inquiry"), eq(activityLog.entityId, id)))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(page.limit + 1).offset(page.offset);
  const emailJobs = await db.select(emailFields).from(crmEmailJob).where(eq(crmEmailJob.corporateInquiryId, id))
    .orderBy(crmEmailJob.kind);
  return {
    ...inquiry, emailJobs, history: history.slice(0, page.limit).map(entry => ({
      ...entry,
      changes: historyChangesSchema.parse(entry.changes)
    })), historyHasMore: history.length > page.limit
  };
}

export async function changeInquiry(db: Db, id: string, actor: PortalActor, input: z.output<typeof inquiryTransitionSchema>) {
  return db.transaction(async tx => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    await tx.execute(sql`set local statement_timeout = '10s'`);
    const [before] = await tx.select().from(corporateInquiry).where(eq(corporateInquiry.id, id)).for("update");
    if (!before) throw new IntakeError(404, "inquiry_not_found");
    if (before.status !== input.expectedStatus) throw new IntakeError(409, "inquiry_status_changed");
    assertInquiryTransition(before.status, input.status);
    const [after] = await tx.update(corporateInquiry).set({
      status: input.status, updatedAt: sql`clock_timestamp()`,
      ...(input.status === "CONTACTED" ? { contactedAt: sql`clock_timestamp()` } : {}),
      ...(input.status === "PROPOSAL_SENT" ? { proposalSentAt: sql`clock_timestamp()`, estimatedValueCentavos: input.estimatedValueCentavos } : {}),
      ...(["WON", "LOST"].includes(input.status) ? { closedAt: sql`clock_timestamp()` } : {}),
      ...(input.status === "LOST" ? { lostReason: input.lostReason } : {})
    }).where(eq(corporateInquiry.id, id)).returning({
      status: corporateInquiry.status,
      contactedAt: corporateInquiry.contactedAt, proposalSentAt: corporateInquiry.proposalSentAt,
      closedAt: corporateInquiry.closedAt, estimatedValueCentavos: corporateInquiry.estimatedValueCentavos, lostReason: corporateInquiry.lostReason
    });
    // An in-flight provider request cannot be retracted; only skip unclaimed reminders.
    await tx.update(crmEmailJob).set({ state: "skipped", leaseExpiresAt: null, lastErrorCode: "inquiry_reminder_obsolete" })
      .where(and(eq(crmEmailJob.corporateInquiryId, id), eq(crmEmailJob.kind, "corporate_overdue"),
        inArray(crmEmailJob.state, ["pending", "failed"])));
    await logActivity(tx, {
      userId: actor.id, action: "status_change", entityType: "corporate_inquiry", entityId: id,
      changes: { ...diffChanges(before, after), actor: { from: null, to: { id: actor.id, name: actor.name, email: actor.email } } }
    });
    return { changed: true, status: after.status };
  });
}

export async function retryInquiryEmail(db: Db, inquiryId: string, jobId: string, actor: PortalActor, apiKey: string,
  transport?: EmailTransport) {
  const [job] = await db.select({ ...emailFields, now: sql<Date>`clock_timestamp()` }).from(crmEmailJob)
    .where(and(eq(crmEmailJob.id, jobId), eq(crmEmailJob.corporateInquiryId, inquiryId)));
  if (!job) throw new IntakeError(404, "email_job_not_found");
  if (!["pending", "failed", "sending"].includes(job.state)
    || (job.state === "sending" && job.leaseExpiresAt && job.leaseExpiresAt > new Date(job.now))) {
    throw new IntakeError(409, "email_not_retryable");
  }
  await sendEmailJob(db, jobId, apiKey, transport, actor);
  const [result] = await db.select(emailFields).from(crmEmailJob).where(eq(crmEmailJob.id, jobId));
  return result;
}
