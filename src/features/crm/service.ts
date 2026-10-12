import "@tanstack/react-start/server-only";
import { eq, sql } from "drizzle-orm";
import { corporateInquiry, crmEmailJob, crmSubmissionKey } from "@/db/schema";
import type { DbOrTx } from "@/features/shared/db-types";
import { inquiryDeadline } from "./deadline";
import { IntakeError } from "./errors";
import type { CorporateInquiryInput } from "./schemas";

import { corporateMessages, type CorporateMailConfig } from "./templates";
export type { CorporateMailConfig } from "./templates";

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
    const messages = corporateMessages(data, saved.id, config);
    const jobs = await tx.insert(crmEmailJob).values([
      { corporateInquiryId: saved.id, kind: "corporate_acknowledgment", payload: messages.acknowledgment },
      { corporateInquiryId: saved.id, kind: "corporate_notification", payload: messages.notification }
    ]).returning({ id: crmEmailJob.id });
    await tx.insert(crmSubmissionKey).values({ key, payloadHash: hash, corporateInquiryId: saved.id });
    return jobs.map(job => job.id);
  });
}
