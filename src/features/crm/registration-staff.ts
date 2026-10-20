import "@tanstack/react-start/server-only";
import { and, asc, desc, eq, getTableColumns, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias, type PgUpdateSetSource } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Db } from "@/db";
import { CrmEmailKind, CrmEmailState, activityLog, crmEmailJob, paymentMethod, registration, user, workshop, workshopSession } from "@/db/schema";
import { diffChanges, logActivity } from "@/features/shared/audit";
import { manilaWallClock } from "@/features/shared/time";
import type { PortalActor } from "@/lib/access";
import { sendEmailJob, type EmailTransport } from "./email";
import { IntakeError, IntakeErrorCode } from "./errors";
import { registrationAcknowledgmentMessage, registrationMessageHasPlaceholders, type RegistrationMailConfig } from "./registration-template";
import { RegistrationAction, type registrationActionSchema, type registrationDetailSchema, type registrationListSchema, type registrationSessionListSchema } from "./registration-staff-schemas";

const { idempotencyKey: _key, payloadHash: _hash, ...registrationFields } = getTableColumns(registration);
const emailFields = {
  id: crmEmailJob.id, kind: crmEmailJob.kind, state: crmEmailJob.state, attemptCount: crmEmailJob.attemptCount,
  firstAttemptAt: crmEmailJob.firstAttemptAt, lastAttemptAt: crmEmailJob.lastAttemptAt,
  leaseExpiresAt: crmEmailJob.leaseExpiresAt, sentAt: crmEmailJob.sentAt, lastErrorCode: crmEmailJob.lastErrorCode
};

const change = <T extends z.ZodType>(value: T) => z.object({ from: value.nullable(), to: value.nullable() }).optional();
const historyChangesSchema = z.object({
  isPaid: change(z.boolean()), paymentMethod: change(z.enum(paymentMethod.enumValues)),
  paidAmountCentavos: change(z.number()), payerName: change(z.string()), providerTransactionReference: change(z.string()),
  verifiedAt: change(z.string()), verifiedBy: change(z.string()), cancelledAt: change(z.string()),
  cancelledBy: change(z.string()), cancellationReason: change(z.string()), updatedAt: change(z.string()), reason: change(z.string()),
  actor: change(z.object({ id: z.string(), name: z.string(), email: z.string() })),
  emailRetry: change(z.object({ jobId: z.uuid(), state: z.string(), attemptCount: z.number() }))
});

function sessionQuery(db: Db) {
  return db.select({
    id: workshopSession.id, workshopId: workshop.id, workshopTitle: workshop.title, courseCode: workshop.courseCode,
    workshopStatus: workshop.status, date: workshopSession.date, endDate: workshopSession.endDate,
    startTime: workshopSession.startTime, endTime: workshopSession.endTime, venueName: workshopSession.venueName,
    city: workshopSession.city, status: workshopSession.status, capacity: workshopSession.capacity, priceCentavos: workshopSession.priceCentavos,
    counts: sql<{ reserved: number; remaining: number; paid: number; unpaid: number; cancelled: number }>`(
      select jsonb_build_object(
        'reserved', count(*) filter (where ${registration.cancelledAt} is null),
        'remaining', greatest(${workshopSession.capacity} - count(*) filter (where ${registration.cancelledAt} is null), 0),
        'paid', count(*) filter (where ${registration.cancelledAt} is null and ${registration.isPaid}),
        'unpaid', count(*) filter (where ${registration.cancelledAt} is null and not ${registration.isPaid}),
        'cancelled', count(*) filter (where ${registration.cancelledAt} is not null)
      ) from ${registration} where ${registration.workshopSessionId} = ${workshopSession.id}
    )`
  }).from(workshopSession).innerJoin(workshop, eq(workshop.id, workshopSession.workshopId));
}

export async function listRegistrationSessions(db: Db, input: z.output<typeof registrationSessionListSchema>) {
  const clock = manilaWallClock();
  const past = sql<boolean>`(${workshopSession.endDate} < ${clock.date}
    or (${workshopSession.endDate} = ${clock.date} and ${workshopSession.endTime} <= ${clock.time}))`;
  const rows = await sessionQuery(db).where(and(
    input.when === "all" ? undefined : input.when === "past" ? past : sql`not ${past}`,
    input.workshopId ? eq(workshopSession.workshopId, input.workshopId) : undefined
  )).orderBy(desc(workshopSession.date), desc(workshopSession.id)).limit(input.limit + 1).offset(input.offset);
  return { items: rows.slice(0, input.limit), hasMore: rows.length > input.limit, timeZone: "Asia/Manila" };
}

export async function registrationSessionDetail(db: Db, id: string) {
  const [session] = await sessionQuery(db).where(eq(workshopSession.id, id));
  if (!session) throw new IntakeError(404, IntakeErrorCode.RegistrationSessionNotFound);
  return { ...session, timeZone: "Asia/Manila" };
}

export async function listRegistrations(db: Db, input: z.output<typeof registrationListSchema>) {
  const pattern = `%${input.search.replace(/[\\%_]/g, "\\$&")}%`;
  const rows = await db.select({
    id: registration.id, reference: registration.reference, fullName: registration.fullName, email: registration.email,
    phone: registration.phone, priceCentavos: registration.priceCentavos, isPaid: registration.isPaid,
    cancelledAt: registration.cancelledAt, createdAt: registration.createdAt, updatedAt: registration.updatedAt
  }).from(registration).where(and(
    eq(registration.workshopSessionId, input.workshopSessionId),
    input.filter === "all" ? undefined : input.filter === "cancelled" ? isNotNull(registration.cancelledAt) : isNull(registration.cancelledAt),
    input.filter === "paid" || input.filter === "unpaid" ? eq(registration.isPaid, input.filter === "paid") : undefined,
    input.search ? or(ilike(registration.reference, pattern), ilike(registration.fullName, pattern), ilike(registration.email, pattern)) : undefined
  )).orderBy(desc(registration.createdAt), desc(registration.id)).limit(input.limit + 1).offset(input.offset);
  return { items: rows.slice(0, input.limit), hasMore: rows.length > input.limit };
}

export async function registrationDetail(db: Db, id: string, page: z.output<typeof registrationDetailSchema>) {
  const verifier = alias(user, "verifier");
  const canceller = alias(user, "canceller");
  const [row] = await db.select({ ...registrationFields, verifiedByName: verifier.name, cancelledByName: canceller.name })
    .from(registration)
    .leftJoin(verifier, eq(verifier.id, registration.verifiedBy))
    .leftJoin(canceller, eq(canceller.id, registration.cancelledBy))
    .where(eq(registration.id, id));
  if (!row) throw new IntakeError(404, IntakeErrorCode.RegistrationNotFound);
  const session = await registrationSessionDetail(db, row.workshopSessionId);
  const history = await db.select({ id: activityLog.id, action: activityLog.action, createdAt: activityLog.createdAt, changes: activityLog.changes })
    .from(activityLog).where(and(eq(activityLog.entityType, "registration"), eq(activityLog.entityId, id)))
    .orderBy(desc(activityLog.createdAt), desc(activityLog.id)).limit(page.limit + 1).offset(page.offset);
  const emailJobs = await db.select(emailFields).from(crmEmailJob).where(eq(crmEmailJob.registrationId, id)).orderBy(asc(crmEmailJob.kind));
  return { ...row, session, emailJobs, history: history.slice(0, page.limit).map(entry => ({
    ...entry, changes: historyChangesSchema.parse(entry.changes)
  })), historyHasMore: history.length > page.limit };
}

export async function changeRegistration(db: Db, actor: PortalActor, input: z.output<typeof registrationActionSchema>, config?: RegistrationMailConfig) {
  return db.transaction(async tx => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    await tx.execute(sql`set local statement_timeout = '10s'`);
    const [lookup] = await tx.select({ sessionId: registration.workshopSessionId, workshopId: workshopSession.workshopId })
      .from(registration).innerJoin(workshopSession, eq(workshopSession.id, registration.workshopSessionId)).where(eq(registration.id, input.id));
    if (!lookup) throw new IntakeError(404, IntakeErrorCode.RegistrationNotFound);
    // Match intake's workshop -> session -> registration -> jobs lock order.
    const [course] = await tx.select({ title: workshop.title }).from(workshop).where(eq(workshop.id, lookup.workshopId)).for("share");
    const [session] = await tx.select().from(workshopSession).where(eq(workshopSession.id, lookup.sessionId)).for("update");
    const [before] = await tx.select().from(registration).where(eq(registration.id, input.id)).for("update");
    if (!before) throw new IntakeError(404, IntakeErrorCode.RegistrationNotFound);
    if (before.cancelledAt) throw new IntakeError(409, IntakeErrorCode.RegistrationCancelled);
    if (before.isPaid !== input.expectedIsPaid || before.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime()) {
      throw new IntakeError(409, IntakeErrorCode.RegistrationStatusChanged);
    }
    // Advance the timestamp by at least 1 ms so every change invalidates the reviewed version.
    const updatedAt = sql`greatest(clock_timestamp(), ${registration.updatedAt} + interval '1 millisecond')`;
    const values: PgUpdateSetSource<typeof registration> = { updatedAt };
    if (input.action === RegistrationAction.MarkPaid) {
      values.isPaid = true;
      values.paymentMethod = input.paymentMethod;
      values.paidAmountCentavos = input.paidAmountCentavos;
      values.payerName = input.payerName;
      values.providerTransactionReference = input.providerTransactionReference;
      values.verifiedAt = sql`clock_timestamp()`;
      values.verifiedBy = actor.id;
    } else if (input.action === RegistrationAction.CorrectPayment) {
      values.isPaid = false;
    } else {
      values.cancelledAt = sql`clock_timestamp()`;
      values.cancelledBy = actor.id;
      values.cancellationReason = input.reason;
    }
    const [after] = await tx.update(registration).set(values).where(eq(registration.id, input.id)).returning();
    const jobs: string[] = [];
    if (input.action === RegistrationAction.MarkPaid) {
      if (!config) throw new IntakeError(503, IntakeErrorCode.EmailUnavailable);
      const [existing] = await tx.select().from(crmEmailJob)
        .where(and(eq(crmEmailJob.registrationId, input.id), eq(crmEmailJob.kind, CrmEmailKind.PaymentAcknowledgment))).for("update");
      if (existing) {
        if ([CrmEmailState.Pending, CrmEmailState.Failed, CrmEmailState.Sending].some(state => state === existing.state)) jobs.push(existing.id);
      } else {
        const payload = registrationAcknowledgmentMessage(config,
          { ...after, paidAmountCentavos: input.paidAmountCentavos }, course, session);
        if (config.REGISTRATION_EMAIL_ENABLED && registrationMessageHasPlaceholders(payload)) {
          throw new IntakeError(503, IntakeErrorCode.EmailUnavailable);
        }
        const [job] = await tx.insert(crmEmailJob).values({ registrationId: input.id, kind: CrmEmailKind.PaymentAcknowledgment, payload })
          .returning({ id: crmEmailJob.id });
        jobs.push(job.id);
      }
    }
    // A provider request already in flight cannot be recalled. Leave its outcome intact.
    if (input.action !== RegistrationAction.CorrectPayment) {
      await tx.update(crmEmailJob).set({ state: CrmEmailState.Skipped, leaseExpiresAt: null, lastErrorCode: "payment_instructions_obsolete" })
        .where(and(eq(crmEmailJob.registrationId, input.id), eq(crmEmailJob.kind, CrmEmailKind.PaymentInstructions), inArray(crmEmailJob.state, [CrmEmailState.Pending, CrmEmailState.Failed])));
    }
    await logActivity(tx, { userId: actor.id, action: "status_change", entityType: "registration", entityId: input.id,
      changes: { ...diffChanges(before, after),
        ...(input.action === RegistrationAction.MarkPaid ? {} : { reason: { from: null, to: input.reason } }),
        actor: { from: null, to: { id: actor.id, name: actor.name, email: actor.email } } } });
    return { changed: true, isPaid: after.isPaid, cancelledAt: after.cancelledAt, updatedAt: after.updatedAt, jobs };
  });
}

export async function retryRegistrationEmail(db: Db, registrationId: string, jobId: string, actor: PortalActor, apiKey: string,
  transport?: EmailTransport) {
  const [job] = await db.select({ ...emailFields, now: sql<Date>`clock_timestamp()` }).from(crmEmailJob)
    .where(and(eq(crmEmailJob.id, jobId), eq(crmEmailJob.registrationId, registrationId)));
  if (!job) throw new IntakeError(404, IntakeErrorCode.EmailJobNotFound);
  if (
    ![CrmEmailKind.PaymentInstructions, CrmEmailKind.PaymentAcknowledgment].some(kind => kind === job.kind)
    || ![CrmEmailState.Pending, CrmEmailState.Failed, CrmEmailState.Sending].some(state => state === job.state)
    || (job.state === CrmEmailState.Sending && job.leaseExpiresAt && job.leaseExpiresAt > new Date(job.now))
  ) {
    throw new IntakeError(409, IntakeErrorCode.EmailNotRetryable);
  }
  await sendEmailJob(db, jobId, apiKey, transport, actor);
  const [result] = await db.select(emailFields).from(crmEmailJob).where(eq(crmEmailJob.id, jobId));
  return result;
}
