import "@tanstack/react-start/server-only";
import { z } from "zod";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { CrmEmailKind, crmEmailJob, crmSubmissionKey, media, paymentAccount, registration, workshop, workshopSession } from "@/db/schema";
import { publicMediaUrl, readPaymentQr } from "@/features/media/r2";
import type { DbOrTx, Tx } from "@/features/shared/db-types";
import { hasSessionStarted } from "@/features/shared/time";
import { IntakeError, IntakeErrorCode } from "./errors";
import { allocateRegistrationReference } from "./registration-reference";
import { registrationMessageHasPlaceholders, registrationPaymentMessage, type RegistrationMailConfig } from "./registration-template";
import type { RegistrationInput } from "./schemas";

const secureUrl = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
});

type Acceptance = { accepted: true; reference?: string; isPaid?: false };
const originalResult = (reference: string): Acceptance => ({ accepted: true, reference, isPaid: false });

export async function acceptRegistration(db: DbOrTx, data: RegistrationInput, key: string, config: RegistrationMailConfig, now?: Date) {
  if (data.consent !== true) throw new IntakeError(400, IntakeErrorCode.ConsentRequired);
  const canonical = JSON.stringify({ kind: "registration", data: Object.fromEntries(
    Object.entries(data).sort(([a], [b]) => a.localeCompare(b))) });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const prepared = await db.transaction(tx => checkRegistration(tx, data, key, hash, config, now));
  if (prepared.result) return prepared.result;

  // Download outside database locks, then recheck before reserving the seat.
  const source = prepared.destination.qr;
  const attachment = await readPaymentQr(source);

  return db.transaction(async tx => {
    const checked = await checkRegistration(tx, data, key, hash, config, now);
    if (checked.result) return checked.result;
    const { course, courseCode, session, destination, qrUrl, acceptedAt } = checked;
    if (source.id !== destination.qr.id || source.key !== destination.qr.key
      || source.sizeBytes !== destination.qr.sizeBytes || source.contentType !== destination.qr.contentType
      || source.updatedAt.getTime() !== destination.qr.updatedAt.getTime()) {
      throw new IntakeError(503, IntakeErrorCode.IntakeUnavailable);
    }
    const reference = await allocateRegistrationReference(tx, courseCode);
    const { consent: _consent, ...answers } = data;
    const [saved] = await tx.insert(registration).values({ ...answers, reference, idempotencyKey: key, payloadHash: hash,
      priceCentavos: session.priceCentavos, consentAt: acceptedAt, createdAt: acceptedAt }).returning({ id: registration.id });
    await tx.insert(crmSubmissionKey).values({ key, payloadHash: hash, registrationId: saved.id });
    const payload = await registrationPaymentMessage(config, { ...data, reference, priceCentavos: session.priceCentavos },
      course, session, destination.account, qrUrl, attachment);
    if (config.REGISTRATION_EMAIL_ENABLED && registrationMessageHasPlaceholders(payload)) {
      throw new IntakeError(503, IntakeErrorCode.EmailUnavailable);
    }
    const [job] = await tx.insert(crmEmailJob).values({ registrationId: saved.id, kind: CrmEmailKind.PaymentInstructions, payload })
      .returning({ id: crmEmailJob.id });
    return { response: originalResult(reference), jobs: [job.id] };
  });
}

async function checkRegistration(tx: Tx, data: RegistrationInput, key: string, hash: string,
  config: RegistrationMailConfig, now?: Date) {
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
    return { result: { response: saved.idempotencyKey === key ? originalResult(saved.reference) : { accepted: true } as Acceptance, jobs: [] as string[] } };
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
    return { result: { response: { accepted: true } as Acceptance, jobs: [] as string[] } };
  }
  const [seats] = await tx.select({ total: count() }).from(registration).where(active);
  if (seats.total >= session.capacity) throw new IntakeError(409, IntakeErrorCode.SoldOut);
  const [destination] = await tx.select({ account: paymentAccount, qr: media }).from(paymentAccount)
    .innerJoin(media, eq(media.id, paymentAccount.qrMediaId))
    .where(and(eq(paymentAccount.id, config.REGISTRATION_PAYMENT_ACCOUNT_ID), isNull(paymentAccount.archivedAt), isNull(media.archivedAt)))
    .for("share");
  if (!destination) throw new IntakeError(503, IntakeErrorCode.IntakeUnavailable);

  const { account, qr } = destination;
  const hasPaymentDetails = Boolean(
    account.providerName.trim() && account.accountName.trim() && account.accountNumber.trim()
  );
  const hasSupportedQr = Boolean(qr.key)
    && ["image/png", "image/jpeg", "image/webp"].includes(qr.contentType)
    && qr.sizeBytes > 0 && qr.sizeBytes <= 1024 * 1024;
  const hasSecurePrimer = secureUrl.safeParse(course.primerVideoUrl).success;

  if (!hasPaymentDetails || !hasSupportedQr || !hasSecurePrimer) {
    throw new IntakeError(503, IntakeErrorCode.IntakeUnavailable);
  }
  const qrUrl = publicMediaUrl(destination.qr.key);
  if (!secureUrl.safeParse(qrUrl).success) throw new IntakeError(503, IntakeErrorCode.IntakeUnavailable);
  return { course, courseCode: course.courseCode, session, destination, qrUrl, acceptedAt };
}
