import "@tanstack/react-start/server-only";
import { and, asc, eq, inArray, isNotNull, lt, notExists, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { CrmEmailKind, CrmEmailState, corporateInquiry, crmEmailJob } from "@/db/schema";
import type { DbOrTx } from "@/features/shared/db-types";
import { getCorporateMailConfig } from "./config";
import { sendEmailJob, type EmailTransport } from "./email";
import { IntakeError, IntakeErrorCode } from "./errors";
import { corporateOverdueMessage, type CorporateMailConfig } from "./templates";

// Bounds each invocation; the next 15-minute tick handles remaining work.
const QUEUE_LIMIT = 50;
const RECOVERY_LIMIT = 10;

export async function queueOverdueInquiries(db: DbOrTx, config: CorporateMailConfig) {
  return db.transaction(async tx => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    await tx.execute(sql`set local statement_timeout = '10s'`);
    const inquiries = await tx.select().from(corporateInquiry).where(and(
      eq(corporateInquiry.status, "NEW"), lt(corporateInquiry.slaDueAt, sql`clock_timestamp()`),
      notExists(tx.select({ id: crmEmailJob.id }).from(crmEmailJob).where(and(
        eq(crmEmailJob.corporateInquiryId, corporateInquiry.id), eq(crmEmailJob.kind, CrmEmailKind.CorporateOverdue))))
    )).orderBy(asc(corporateInquiry.slaDueAt), asc(corporateInquiry.id)).limit(QUEUE_LIMIT).for("update", { skipLocked: true });
    if (!inquiries.length) return 0;
    const queued = await tx.insert(crmEmailJob).values(inquiries.map(inquiry => ({
      corporateInquiryId: inquiry.id, kind: CrmEmailKind.CorporateOverdue, payload: corporateOverdueMessage(inquiry, config)
    }))).onConflictDoNothing().returning({ id: crmEmailJob.id });
    return queued.length;
  });
}

export async function runCorporateScheduler(db: DbOrTx, config: ReturnType<typeof getCorporateMailConfig>, transport?: EmailTransport) {
  const queued = await queueOverdueInquiries(db, config);
  if (!config.CORPORATE_EMAIL_ENABLED) return { queued, processed: 0, errors: 0, sendingEnabled: false };
  const jobs = await db.select({ id: crmEmailJob.id }).from(crmEmailJob).where(and(
    isNotNull(crmEmailJob.corporateInquiryId),
    or(inArray(crmEmailJob.state, [CrmEmailState.Pending, CrmEmailState.Failed]),
      and(eq(crmEmailJob.state, CrmEmailState.Sending), lt(crmEmailJob.leaseExpiresAt, sql`clock_timestamp()`)))
  )).orderBy(asc(crmEmailJob.updatedAt), asc(crmEmailJob.id)).limit(RECOVERY_LIMIT);
  let errors = 0;
  // Two requests at a time keep the batch within the scheduler's timeout.
  for (let offset = 0; offset < jobs.length; offset += 2) {
    const results = await Promise.allSettled(jobs.slice(offset, offset + 2).map(async job => {
      try { await sendEmailJob(db, job.id, config.RESEND_API_KEY, transport); }
      catch (error) {
        // Rotate blocked snapshots behind other work without changing their content.
        // They remain visible for manual review instead of starving later jobs.
        if (error instanceof IntakeError && error.code === IntakeErrorCode.EmailUnavailable) {
          await db.update(crmEmailJob).set({ updatedAt: sql`clock_timestamp()`, lastErrorCode: IntakeErrorCode.EmailUnavailable })
            .where(and(eq(crmEmailJob.id, job.id), inArray(crmEmailJob.state, [CrmEmailState.Pending, CrmEmailState.Failed, CrmEmailState.Sending])));
        }
        throw error;
      }
    }));
    errors += results.filter(result => result.status === "rejected").length;
  }
  return { queued, processed: jobs.length, errors, sendingEnabled: true };
}

async function authenticateScheduler(request: Request) {
  const secret = process.env.CORPORATE_SCHEDULER_SECRET;
  if (!secret || secret.length < 32) throw new IntakeError(503, IntakeErrorCode.SchedulerUnavailable);
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.length > 1024) throw new IntakeError(401, IntakeErrorCode.SchedulerUnauthorized);
  // Compare fixed-size hashes so the comparison does not stop at the first differing byte.
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [expected, supplied] = await Promise.all([hash(`Bearer ${secret}`), hash(authorization)]);
  let difference = 0;
  for (let index = 0; index < expected.length; index++) difference |= expected[index] ^ supplied[index];
  if (difference !== 0) throw new IntakeError(401, IntakeErrorCode.SchedulerUnauthorized);
}

export async function handleCorporateScheduler(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    if (request.method !== "POST") throw new IntakeError(405, IntakeErrorCode.MethodNotAllowed);
    await authenticateScheduler(request);
    if (process.env.CORPORATE_SCHEDULER_ENABLED !== "true") throw new IntakeError(503, IntakeErrorCode.SchedulerDisabled);
    const result = await runCorporateScheduler(getDb(), getCorporateMailConfig());
    return Response.json(result, { headers });
  } catch (error) {
    const failure = error instanceof IntakeError ? error : new IntakeError(503, IntakeErrorCode.SchedulerUnavailable);
    return Response.json({ error: failure.code }, { status: failure.status, headers });
  }
}
