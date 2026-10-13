import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { stringList } from "./columns";

export const corporateInquiryStatus = pgEnum("corporate_inquiry_status", [
  "NEW", "CONTACTED", "PROPOSAL_SENT", "WON", "LOST", "SPAM"
]);
export const crmEmailKind = pgEnum("crm_email_kind", [
  "corporate_acknowledgment",
  "corporate_notification",
  "corporate_overdue"
]);
// "sent" means accepted by the provider, not delivered to the recipient's inbox.
export const crmEmailState = pgEnum("crm_email_state", [
  "pending", "sending", "sent", "failed", "skipped", "needs_reconciliation"
]);

export type CrmEmailPayload = {
  from: string;
  to: string[];
  replyTo?: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
};

function timestamps() {
  return {
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull()
  };
}

function submissionColumns() {
  return {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    // Store the normalized email; the database rejects noncanonical values.
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull().unique(),
    payloadHash: text("payload_hash").notNull(),
    ...timestamps()
  };
}

export const corporateInquiry = pgTable("corporate_inquiry", {
  ...submissionColumns(),
  company: text("company").notNull(),
  role: text("role").notNull(),
  program: text("program").notNull(),
  attendees: text("attendees").notNull(),
  targetDateFrom: date("target_date_from"),
  targetDateTo: date("target_date_to"),
  // Keep the original column for the form's "Not fixed yet" option.
  targetDateText: text("target_date"),
  venue: text("venue").notNull(),
  context: text("context"),
  alsoInterested: stringList("also_interested"),
  status: corporateInquiryStatus("status").default("NEW").notNull(),
  slaDueAt: timestamp("sla_due_at", { withTimezone: true }).notNull(),
  contactedAt: timestamp("contacted_at", { withTimezone: true }),
  proposalSentAt: timestamp("proposal_sent_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  estimatedValueCentavos: integer("estimated_value_centavos"),
  lostReason: text("lost_reason")
}, (table) => [
  index("corporate_inquiry_created_idx").on(table.createdAt, table.id),
  index("corporate_inquiry_status_created_idx").on(table.status, table.createdAt, table.id),
  index("corporate_inquiry_overdue_idx").on(table.slaDueAt, table.id).where(sql`${table.status} = 'NEW'`),
  check("corporate_inquiry_email_normalized", sql`${table.email} = lower(btrim(${table.email})) AND ${table.email} <> ''`),
  check("corporate_inquiry_payload_hash_sha256", sql`${table.payloadHash} ~ '^[0-9a-f]{64}$'`),
  check("corporate_inquiry_programs_array", sql`jsonb_typeof(${table.alsoInterested}) = 'array'`),
  check("corporate_inquiry_target_dates_consistent", sql`
    (${table.targetDateFrom} IS NOT NULL AND ${table.targetDateText} IS NULL
      AND (${table.targetDateTo} IS NULL OR ${table.targetDateTo} >= ${table.targetDateFrom}))
    OR (${table.targetDateFrom} IS NULL AND ${table.targetDateTo} IS NULL
      AND ${table.targetDateText} IS NOT NULL AND btrim(${table.targetDateText}) <> '')
  `),
  check("corporate_inquiry_value_non_negative", sql`${table.estimatedValueCentavos} >= 0`),
  check("corporate_inquiry_deadline_after_creation", sql`${table.slaDueAt} > ${table.createdAt}`),
  check("corporate_inquiry_lifecycle_consistent", sql`
    (${table.status} IN ('NEW', 'SPAM') AND ${table.contactedAt} IS NULL AND ${table.proposalSentAt} IS NULL
      AND ${table.closedAt} IS NULL AND ${table.lostReason} IS NULL)
    OR (${table.status} = 'CONTACTED' AND ${table.contactedAt} IS NOT NULL AND ${table.proposalSentAt} IS NULL
      AND ${table.closedAt} IS NULL AND ${table.lostReason} IS NULL)
    OR (${table.status} = 'PROPOSAL_SENT' AND ${table.contactedAt} IS NOT NULL AND ${table.proposalSentAt} IS NOT NULL
      AND ${table.estimatedValueCentavos} IS NOT NULL AND ${table.closedAt} IS NULL AND ${table.lostReason} IS NULL)
    OR (${table.status} = 'WON' AND ${table.contactedAt} IS NOT NULL AND ${table.proposalSentAt} IS NOT NULL
      AND ${table.estimatedValueCentavos} IS NOT NULL AND ${table.closedAt} IS NOT NULL AND ${table.lostReason} IS NULL)
    OR (${table.status} = 'LOST' AND ${table.closedAt} IS NOT NULL AND ${table.lostReason} IS NOT NULL
      AND btrim(${table.lostReason}) <> ''
      AND (${table.proposalSentAt} IS NULL OR (${table.contactedAt} IS NOT NULL AND ${table.estimatedValueCentavos} IS NOT NULL)))
  `)
]);

// Remember every accepted inquiry submission key.
// The submission's own key remains its original request identifier.
export const crmSubmissionKey = pgTable("crm_submission_key", {
  key: uuid("key").primaryKey(),
  payloadHash: text("payload_hash").notNull(),
  corporateInquiryId: uuid("corporate_inquiry_id").notNull().references(() => corporateInquiry.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("crm_submission_key_inquiry_idx").on(table.corporateInquiryId),
  check("crm_submission_key_hash_sha256", sql`${table.payloadHash} ~ '^[0-9a-f]{64}$'`)
]);

// Save the message once; application updates change delivery metadata only.
// Use the job UUID as the provider idempotency key on retries.
export const crmEmailJob = pgTable("crm_email_job", {
  id: uuid("id").primaryKey().defaultRandom(),
  corporateInquiryId: uuid("corporate_inquiry_id").notNull().references(() => corporateInquiry.id, { onDelete: "restrict" }),
  kind: crmEmailKind("kind").notNull(),
  payload: jsonb("payload").$type<CrmEmailPayload>().notNull(),
  state: crmEmailState("state").default("pending").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  firstAttemptAt: timestamp("first_attempt_at", { withTimezone: true }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  providerId: text("provider_id"),
  lastErrorCode: text("last_error_code"),
  ...timestamps()
}, (table) => [
  uniqueIndex("crm_email_job_inquiry_kind_idx").on(table.corporateInquiryId, table.kind),
  index("crm_email_job_corporate_recovery_idx").on(table.updatedAt, table.id)
    .where(sql`${table.state} IN ('pending', 'failed', 'sending')`),
  check("crm_email_job_payload_object", sql`jsonb_typeof(${table.payload}) = 'object'`),
  check("crm_email_job_attempts_consistent", sql`
    (${table.attemptCount} = 0 AND ${table.firstAttemptAt} IS NULL AND ${table.lastAttemptAt} IS NULL)
    OR (${table.attemptCount} > 0 AND ${table.firstAttemptAt} IS NOT NULL
      AND ${table.lastAttemptAt} IS NOT NULL AND ${table.lastAttemptAt} >= ${table.firstAttemptAt})
  `),
  check("crm_email_job_lease_consistent", sql`
    (${table.state} = 'sending' AND ${table.attemptCount} > 0 AND ${table.leaseExpiresAt} IS NOT NULL)
    OR (${table.state} <> 'sending' AND ${table.leaseExpiresAt} IS NULL)
  `),
  check("crm_email_job_sent_consistent", sql`
    (${table.state} = 'sent' AND ${table.attemptCount} > 0 AND ${table.sentAt} IS NOT NULL
      AND ${table.providerId} IS NOT NULL AND btrim(${table.providerId}) <> '')
    OR (${table.state} <> 'sent' AND ${table.sentAt} IS NULL AND ${table.providerId} IS NULL)
  `),
  check("crm_email_job_safe_error_code", sql`${table.lastErrorCode} ~ '^[a-z][a-z0-9_]{0,63}$'`)
]);
