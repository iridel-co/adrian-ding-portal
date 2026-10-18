import "@tanstack/react-start/server-only";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { crmSubmissionKey, registration, workshop, workshopSession } from "@/db/schema";
import type { DbOrTx } from "@/features/shared/db-types";
import { hasSessionStarted } from "@/features/shared/time";
import { IntakeError, IntakeErrorCode } from "./errors";
import { allocateRegistrationReference } from "./registration-reference";
import type { RegistrationInput } from "./schemas";

type Acceptance = { accepted: true; reference?: string; paymentStatus?: "unpaid" };
const originalResult = (reference: string): Acceptance => ({ accepted: true, reference, paymentStatus: "unpaid" });

export async function acceptRegistration(db: DbOrTx, data: RegistrationInput, key: string, now?: Date): Promise<Acceptance> {
  if (data.consent !== true) throw new IntakeError(400, IntakeErrorCode.ConsentRequired);
  const canonical = JSON.stringify({ kind: "registration", data: Object.fromEntries(
    Object.entries(data).sort(([a], [b]) => a.localeCompare(b))) });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return db.transaction(async tx => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    await tx.execute(sql`set local statement_timeout = '10s'`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`crm:key:${key}`}, 0))`);
    const [receipt] = await tx.select().from(crmSubmissionKey).where(eq(crmSubmissionKey.key, key));
    if (receipt) {
      if (receipt.payloadHash !== hash || !receipt.registrationId) {
        throw new IntakeError(409, IntakeErrorCode.IdempotencyKeyMismatch);
      }
      const [saved] = await tx.select({ reference: registration.reference, idempotencyKey: registration.idempotencyKey })
        .from(registration).where(eq(registration.id, receipt.registrationId));
      // A duplicate's alias key must never reveal the original registration's details.
      return saved.idempotencyKey === key ? originalResult(saved.reference) : { accepted: true };
    }
    const [run] = await tx.select({ workshopId: workshopSession.workshopId }).from(workshopSession)
      .where(eq(workshopSession.id, data.workshopSessionId));
    if (!run) throw new IntakeError(409, IntakeErrorCode.SessionUnavailable);
    // Match the workshop editor's lock order so course codes cannot change during intake.
    const [course] = await tx.select().from(workshop).where(eq(workshop.id, run.workshopId)).for("update");
    const [session] = await tx.select().from(workshopSession).where(eq(workshopSession.id, data.workshopSessionId)).for("update");
    const acceptedAt = now ?? new Date();
    if (!course || !session || session.workshopId !== course.id || course.status !== "published" || !course.courseCode
      || session.status !== "open" || hasSessionStarted(session, acceptedAt)
      || (session.registrationCutoffAt && acceptedAt >= session.registrationCutoffAt)) {
      throw new IntakeError(409, IntakeErrorCode.SessionUnavailable);
    }
    const active = and(eq(registration.workshopSessionId, session.id), isNull(registration.cancelledAt));
    const [duplicate] = await tx.select({ id: registration.id }).from(registration)
      .where(and(active, eq(registration.email, data.email)));
    if (duplicate) {
      await tx.insert(crmSubmissionKey).values({ key, payloadHash: hash, registrationId: duplicate.id });
      return { accepted: true };
    }
    const [seats] = await tx.select({ total: count() }).from(registration).where(active);
    if (seats.total >= session.capacity) throw new IntakeError(409, IntakeErrorCode.SoldOut);
    const reference = await allocateRegistrationReference(tx, course.courseCode);
    const { consent: _consent, ...answers } = data;
    const [saved] = await tx.insert(registration).values({ ...answers, reference, idempotencyKey: key, payloadHash: hash,
      priceCentavos: session.priceCentavos, consentAt: acceptedAt, createdAt: acceptedAt }).returning({ id: registration.id });
    await tx.insert(crmSubmissionKey).values({ key, payloadHash: hash, registrationId: saved.id });
    return originalResult(reference);
  });
}
