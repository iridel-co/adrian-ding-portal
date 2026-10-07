import "@tanstack/react-start/server-only";
import { and, eq, isNull, sql } from "drizzle-orm";

import { corporateInquiry, crmEmailJob, crmSubmissionKey, media, paymentAccount, registration, workshop, workshopSession } from "@/db/schema";
import type { CrmEmailPayload } from "@/db/schema";
import { publicMediaUrl } from "@/features/media/r2";
import type { DbOrTx } from "@/features/shared/db-types";
import { formatPesos } from "@/features/shared/money";
import { hasSessionStarted } from "@/features/shared/time";
import type { CrmEnv } from "@/lib/env";
import type { CorporateInquiryInput, RegistrationInput } from "./schemas";

export class IntakeError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export type SubmissionKind = "registration" | "corporate";

function message(config: CrmEnv, to: string[], subject: string, text: string, qrUrl?: string): CrmEmailPayload {
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
  return {
    from: config.EMAIL_FROM, to, replyTo: config.EMAIL_REPLY_TO, subject, text,
    html: `<div style="white-space:pre-wrap">${escape(text)}</div>${qrUrl ? `<p><img src="${escape(qrUrl)}" alt="Payment QR code"></p>` : ""}`
  };
}

async function payloadHash(kind: SubmissionKind, data: RegistrationInput | CorporateInquiryInput) {
  // Schemas produce flat objects with string arrays. Sort keys so JSON key order
  // does not change the identity of an otherwise identical accepted payload.
  const canonical = JSON.stringify({ kind, data: Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b))) });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function lockKey(tx: DbOrTx, key: string, hash: string) {
  await tx.execute(sql`set local lock_timeout = '5s'`);
  await tx.execute(sql`set local statement_timeout = '10s'`);
  // A transaction-scoped lock serializes this key across sessions and both routes.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`crm:key:${key}`}, 0))`);
  const [receipt] = await tx.select().from(crmSubmissionKey).where(eq(crmSubmissionKey.key, key));
  if (receipt && receipt.payloadHash !== hash) throw new IntakeError(409, "idempotency_key_mismatch");
  return receipt;
}

export async function acceptRegistration(db: DbOrTx, data: RegistrationInput, key: string, config: CrmEnv) {
  const hash = await payloadHash("registration", data);
  await db.transaction(async tx => {
    if (await lockKey(tx, key, hash)) return;
    const [lookup] = await tx.select({ workshopId: workshopSession.workshopId }).from(workshopSession)
      .where(eq(workshopSession.id, data.workshopSessionId));
    if (!lookup) throw new IntakeError(409, "session_unavailable");
    // CMS course-code edits use the same workshop-first ordering. Session
    // cancellation must follow workshop -> session -> registration too.
    const [parent] = await tx.select().from(workshop).where(eq(workshop.id, lookup.workshopId)).for("share");
    const [session] = await tx.select().from(workshopSession).where(eq(workshopSession.id, data.workshopSessionId)).for("update");
    const now = new Date();
    if (!parent || !session || session.workshopId !== parent.id || parent.status !== "published" || session.status !== "open"
      || hasSessionStarted(session, now) || (session.registrationCutoffAt && session.registrationCutoffAt <= now)) {
      throw new IntakeError(409, "session_unavailable");
    }
    const active = and(eq(registration.workshopSessionId, session.id), isNull(registration.cancelledAt));
    const [existing] = await tx.select({ id: registration.id }).from(registration).where(and(active, eq(registration.email, data.email)));
    if (existing) {
      await tx.insert(crmSubmissionKey).values({ key, payloadHash: hash, registrationId: existing.id });
      return;
    }
    const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(registration).where(active);
    if (count >= session.capacity) throw new IntakeError(409, "session_unavailable");

    const [destination] = await tx.select({ account: paymentAccount, qr: media }).from(paymentAccount)
      .innerJoin(media, eq(media.id, paymentAccount.qrMediaId))
      .where(and(eq(paymentAccount.id, config.PAYMENT_ACCOUNT_ID), isNull(paymentAccount.archivedAt), isNull(media.archivedAt)))
      .for("share");
    if (!destination || !destination.account.accountName.trim() || !destination.account.accountNumber.trim()
      || !destination.account.providerName.trim() || !destination.qr.key || destination.qr.sizeBytes <= 0
      || !["image/png", "image/jpeg", "image/webp"].includes(destination.qr.contentType) || !parent.courseCode) {
      throw new IntakeError(503, "intake_unavailable");
    }
    const qrUrl = publicMediaUrl(destination.qr.key);
    if (new URL(qrUrl).protocol !== "https:") throw new IntakeError(503, "intake_unavailable");
    const { consent: _consent, ...answers } = data;
    const [saved] = await tx.insert(registration).values({ ...answers, idempotencyKey: key, payloadHash: hash,
      consentAt: now, priceCentavos: session.priceCentavos }).returning({ id: registration.id });
    const reference = `${parent.courseCode}-${saved.id}`;
    const text = `Hello ${data.fullName},\n\nYour registration has been saved.\nReference: ${reference}\nWorkshop: ${parent.title}\nDates: ${session.date} to ${session.endDate}\nTime: ${session.startTime} to ${session.endTime} (Asia/Manila)\nVenue: ${session.venueName}, ${session.city}\nAmount: ${formatPesos(session.priceCentavos)}\n\nPay to ${destination.account.providerName}\nAccount name: ${destination.account.accountName}\nAccount number: ${destination.account.accountNumber}\nPayment QR: ${qrUrl}\n\nKeep your reference when sharing payment proof with our team. Your payment is currently unpaid.`;
    await tx.insert(crmEmailJob).values({ registrationId: saved.id, kind: "payment_instructions",
      payload: message(config, [data.email], "Your workshop payment instructions", text, qrUrl) });
    await tx.insert(crmSubmissionKey).values({ key, payloadHash: hash, registrationId: saved.id });
  });
}

export async function acceptCorporateInquiry(db: DbOrTx, data: CorporateInquiryInput, key: string, config: CrmEnv) {
  const hash = await payloadHash("corporate", data);
  await db.transaction(async tx => {
    if (await lockKey(tx, key, hash)) return;
    const { consent: _consent, ...answers } = data;
    const [saved] = await tx.insert(corporateInquiry).values({ ...answers, idempotencyKey: key, payloadHash: hash,
      consentAt: new Date() }).returning({ id: corporateInquiry.id });
    const acknowledgment = `Hello ${data.fullName},\n\nWe received your corporate training inquiry for ${data.company}. Our team will follow up with you.\nReference: ${saved.id}\nProgramme: ${data.program}\nPreferred date: ${data.targetDate}`;
    const details = `Corporate training inquiry\nReference: ${saved.id}\nName: ${data.fullName}\nEmail: ${data.email}\nPhone: ${data.phone}\nCompany: ${data.company}\nRole: ${data.role}\nProgramme: ${data.program}\nAttendees: ${data.attendees}\nPreferred date: ${data.targetDate}\nVenue: ${data.venue}\nContext: ${data.context ?? ""}\nAlso interested in: ${data.alsoInterested.join(", ")}`;
    await tx.insert(crmEmailJob).values([
      { corporateInquiryId: saved.id, kind: "corporate_acknowledgment", payload: message(config, [data.email], "We received your training inquiry", acknowledgment) },
      { corporateInquiryId: saved.id, kind: "corporate_notification", payload: message(config, config.CORPORATE_INQUIRY_RECIPIENTS, "New corporate training inquiry", details) }
    ]);
    await tx.insert(crmSubmissionKey).values({ key, payloadHash: hash, corporateInquiryId: saved.id });
  });
}
