import "@tanstack/react-start/server-only";
import { and, eq, sql } from "drizzle-orm";
import { corporateInquiry, crmEmailJob, type CrmEmailPayload } from "@/db/schema";
import type { DbOrTx } from "@/features/shared/db-types";
import { logActivity } from "@/features/shared/audit";
import type { PortalActor } from "@/lib/access";
import { IntakeError } from "./errors";
import { corporateMessageHasPlaceholders } from "./templates";

export type EmailTransport = (payload: CrmEmailPayload, key: string) => Promise<{ id: string }>;

class DeliveryError extends Error {
  constructor(public code: string) { super(code); }
}

export async function sendViaResend(payload: CrmEmailPayload, key: string, apiKey: string) {
  const { replyTo, attachments, ...message } = payload;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(10000), redirect: "error",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ ...message, ...(replyTo ? { reply_to: replyTo } : {}),
      ...(attachments ? { attachments: attachments.map(({ filename, content }) => ({ filename, content })) } : {}) })
  });
  if (!response.ok) throw new DeliveryError(response.status === 409 ? "provider_conflict" : response.status === 429 ? "provider_throttled" : "provider_rejected");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !body.id.trim() || body.id.length > 256) {
    throw new DeliveryError("provider_response_invalid");
  }
  return { id: body.id };
}

// Resend retains keys for 24 hours. Leave a minute for request timing and clock
// differences; never retry an attempted message beyond this conservative window.
// shortcut: definite rejections also expire; retain attempt outcomes if retries beyond 24 hours are needed.
const RETRY_WINDOW_MS = (24 * 60 * 60 - 60) * 1000;
const LEASE_MS = 60000;

// Keep the saved message and job ID unchanged so retries use the same provider key.
// shortcut: direct database edits bypass this rule; add a trigger if other writers need enforcement.
export async function sendEmailJob(db: DbOrTx, id: string, apiKey: string,
  transport: EmailTransport = (payload, key) => sendViaResend(payload, key, apiKey), actor?: PortalActor) {
  const claimed = await db.transaction(async tx => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    await tx.execute(sql`set local statement_timeout = '10s'`);
    const [lookup] = await tx.select({ corporateInquiryId: crmEmailJob.corporateInquiryId }).from(crmEmailJob).where(eq(crmEmailJob.id, id));
    if (!lookup) return null;
    // Staff changes lock the owning record before its jobs. Use that order here
    // too, and release all locks before the provider call.
    const [inquiry] = await tx.select().from(corporateInquiry)
      .where(eq(corporateInquiry.id, lookup.corporateInquiryId)).for("share");
    const [job] = await tx.select().from(crmEmailJob).where(eq(crmEmailJob.id, id)).for("update");
    if (!job || ["sent", "skipped", "needs_reconciliation"].includes(job.state)) return null;
    const [{ instant }] = await tx.execute<{ instant: string }>(sql`select clock_timestamp() as instant`);
    const now = new Date(instant);
    if (job.state === "sending" && job.leaseExpiresAt && job.leaseExpiresAt > now) return null;
    if (job.kind === "corporate_overdue" && (!inquiry || inquiry.status !== "NEW" || inquiry.slaDueAt >= now)) {
      await tx.update(crmEmailJob).set({ state: "skipped", leaseExpiresAt: null, lastErrorCode: "inquiry_reminder_obsolete" }).where(eq(crmEmailJob.id, id));
      return null;
    }
    if (job.firstAttemptAt && now.getTime() - job.firstAttemptAt.getTime() >= RETRY_WINDOW_MS) {
      await tx.update(crmEmailJob).set({ state: "needs_reconciliation", leaseExpiresAt: null, lastErrorCode: "idempotency_window_expired" }).where(eq(crmEmailJob.id, id));
      return null;
    }
    if (job.corporateInquiryId && corporateMessageHasPlaceholders(job.payload)) throw new IntakeError(503, "email_unavailable");
    const [claimed] = await tx.update(crmEmailJob).set({ state: "sending", attemptCount: job.attemptCount + 1,
      firstAttemptAt: job.firstAttemptAt ?? now, lastAttemptAt: now, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), lastErrorCode: null })
      .where(eq(crmEmailJob.id, id)).returning();
    if (actor && job.corporateInquiryId) {
      await logActivity(tx, { userId: actor.id, action: "update", entityType: "corporate_inquiry", entityId: job.corporateInquiryId,
        changes: { emailRetry: { from: { jobId: id, state: job.state, attemptCount: job.attemptCount },
          to: { jobId: id, state: "sending", attemptCount: claimed.attemptCount } },
          actor: { from: null, to: { id: actor.id, name: actor.name, email: actor.email } } } });
    }
    return claimed;
  });
  if (!claimed) return;
  let result: { id: string };
  try {
    result = await transport(claimed.payload, claimed.id);
    if (!result.id?.trim() || result.id.length > 256) throw new DeliveryError("provider_response_invalid");
  } catch (error) {
    await db.update(crmEmailJob).set({ state: "failed", leaseExpiresAt: null,
      lastErrorCode: error instanceof DeliveryError ? error.code : "provider_request_failed" })
      .where(and(eq(crmEmailJob.id, id), eq(crmEmailJob.state, "sending"), eq(crmEmailJob.attemptCount, claimed.attemptCount)));
    return;
  }
  // The attempt number prevents a late response from overwriting a newer claim.
  // If this write fails, the lease remains recoverable with the SAME provider key.
  await db.update(crmEmailJob).set({ state: "sent", sentAt: sql`clock_timestamp()`, providerId: result.id, leaseExpiresAt: null, lastErrorCode: null })
    .where(and(eq(crmEmailJob.id, id), eq(crmEmailJob.state, "sending"), eq(crmEmailJob.attemptCount, claimed.attemptCount)));
}
