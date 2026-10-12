import "@tanstack/react-start/server-only";
import { eq, sql } from "drizzle-orm";
import { corporateInquiry, crmEmailJob, crmSubmissionKey, type CrmEmailPayload } from "@/db/schema";
import type { DbOrTx } from "@/features/shared/db-types";
import { inquiryDeadline } from "./deadline";
import { IntakeError } from "./errors";
import type { CorporateInquiryInput } from "./schemas";

export type CorporateMailConfig = {
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  CORPORATE_INQUIRY_RECIPIENTS: string[];
};

function message(config: CorporateMailConfig, to: string[], subject: string, text: string): CrmEmailPayload {
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]!);
  return { from: config.EMAIL_FROM, to, replyTo: config.EMAIL_REPLY_TO, subject, text,
    html: `<div style="white-space:pre-wrap">${escape(text)}</div>` };
}

/* Reused CRM intake: save only. Public validation and delivery follow in step 2. */
export async function acceptCorporateInquiry(db: DbOrTx, data: CorporateInquiryInput, key: string,
  config: CorporateMailConfig, now = new Date()) {
  if (data.consent !== true) throw new IntakeError(400, "consent_required");
  const canonical = JSON.stringify({ kind: "corporate", data: Object.fromEntries(
    Object.entries(data).sort(([a], [b]) => a.localeCompare(b))) });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return db.transaction(async tx => {
    await tx.execute(sql`set local lock_timeout = '5s'`);
    await tx.execute(sql`set local statement_timeout = '10s'`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`crm:key:${key}`}, 0))`);
    const [receipt] = await tx.select().from(crmSubmissionKey).where(eq(crmSubmissionKey.key, key));
    if (receipt && receipt.payloadHash !== hash) throw new IntakeError(409, "idempotency_key_mismatch");
    if (receipt) return [] as string[];
    const { consent: _consent, ...answers } = data;
    const [saved] = await tx.insert(corporateInquiry).values({ ...answers, idempotencyKey: key, payloadHash: hash,
      createdAt: now, slaDueAt: inquiryDeadline(now) }).returning({ id: corporateInquiry.id });
    const targetDate = data.targetDateFrom
      ? `${data.targetDateFrom}${data.targetDateTo ? ` to ${data.targetDateTo}` : ""}`
      : data.targetDateText!;
    // Baseline templates are carried over; approved E3/N3 content is step 2.
    const acknowledgment = `Hello ${data.fullName},\n\nWe received your corporate training inquiry for ${data.company}. Our team will follow up with you.\nReference: ${saved.id}\nProgramme: ${data.program}\nPreferred date: ${targetDate}`;
    const details = `Corporate training inquiry\nReference: ${saved.id}\nName: ${data.fullName}\nEmail: ${data.email}\nPhone: ${data.phone}\nCompany: ${data.company}\nRole: ${data.role}\nProgramme: ${data.program}\nAttendees: ${data.attendees}\nPreferred date: ${targetDate}\nVenue: ${data.venue}\nContext: ${data.context ?? ""}\nAlso interested in: ${data.alsoInterested.join(", ")}`;
    const jobs = await tx.insert(crmEmailJob).values([
      { corporateInquiryId: saved.id, kind: "corporate_acknowledgment", payload: message(config, [data.email], "We received your training inquiry", acknowledgment) },
      { corporateInquiryId: saved.id, kind: "corporate_notification", payload: message(config, config.CORPORATE_INQUIRY_RECIPIENTS, "New corporate training inquiry", details) }
    ]).returning({ id: crmEmailJob.id });
    await tx.insert(crmSubmissionKey).values({ key, payloadHash: hash, corporateInquiryId: saved.id });
    return jobs.map(job => job.id);
  });
}
