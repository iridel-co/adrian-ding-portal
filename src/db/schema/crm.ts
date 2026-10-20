import { sql } from "drizzle-orm";
import { boolean, check, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { stringList } from "./columns";
import { user } from "./auth";
import { CrmEmailKind } from "./crm-email-kind";
import { CrmEmailState } from "./crm-email-state";
import { paymentMethod } from "./payments";
import { workshopSession } from "./workshops";

export const corporateInquiryStatus = pgEnum("corporate_inquiry_status", [
  "NEW", "CONTACTED", "PROPOSAL_SENT", "WON", "LOST", "SPAM"
]);
export const crmEmailKind = pgEnum("crm_email_kind", CrmEmailKind);
// "sent" means accepted by the provider, not delivered to the recipient's inbox.
export const crmEmailState = pgEnum("crm_email_state", CrmEmailState);

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

// Key by code so reusing a former course code cannot reuse its issued numbers.
export const registrationReferenceCounter = pgTable("registration_reference_counter", {
  courseCode: text("course_code").primaryKey(),
  lastNumber: integer("last_number").notNull()
}, (table) => [
  check("registration_reference_counter_code_format", sql`${table.courseCode} ~ '^[A-Z0-9]{2,8}$'`),
  check("registration_reference_counter_positive", sql`${table.lastNumber} > 0`)
]);

export const registration = pgTable("registration", {
  ...submissionColumns(),
  workshopSessionId: uuid("workshop_session_id").notNull().references(() => workshopSession.id, { onDelete: "restrict" }),
  reference: text("reference").notNull().unique(),
  occupation: text("occupation").notNull(),
  salaryRange: text("salary_range").notNull(),
  city: text("city"),
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  priceCentavos: integer("price_centavos").notNull(),
  isPaid: boolean("is_paid").default(false).notNull(),
  paymentMethod: paymentMethod("payment_method"),
  paidAmountCentavos: integer("paid_amount_centavos"),
  payerName: text("payer_name"),
  providerTransactionReference: text("provider_transaction_reference"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: text("verified_by").references(() => user.id, { onDelete: "restrict" }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelledBy: text("cancelled_by").references(() => user.id, { onDelete: "restrict" }),
  cancellationReason: text("cancellation_reason")
}, (table) => [
  uniqueIndex("registration_active_email_session_idx").on(table.workshopSessionId, table.email).where(sql`${table.cancelledAt} IS NULL`),
  index("registration_session_created_idx").on(table.workshopSessionId, table.createdAt, table.id),
  check("registration_reference_format", sql`${table.reference} ~ '^AD-[A-Z0-9]{2,8}-[0-9]{4,}$'`),
  check("registration_email_normalized", sql`${table.email} = lower(btrim(${table.email})) AND ${table.email} <> ''`),
  check("registration_payload_hash_sha256", sql`${table.payloadHash} ~ '^[0-9a-f]{64}$'`),
  check("registration_price_non_negative", sql`${table.priceCentavos} >= 0`),
  check("registration_paid_amount_non_negative", sql`${table.paidAmountCentavos} >= 0`),
  // Keep the last verification when correcting Paid back to Unpaid; audit records hold each change.
  check("registration_verification_consistent", sql`
    (NOT ${table.isPaid} AND ${table.paymentMethod} IS NULL AND ${table.paidAmountCentavos} IS NULL
      AND ${table.payerName} IS NULL AND ${table.providerTransactionReference} IS NULL
      AND ${table.verifiedAt} IS NULL AND ${table.verifiedBy} IS NULL)
    OR (${table.paymentMethod} IS NOT NULL AND ${table.paidAmountCentavos} IS NOT NULL
      AND ${table.payerName} IS NOT NULL AND btrim(${table.payerName}) <> ''
      AND ${table.providerTransactionReference} IS NOT NULL AND btrim(${table.providerTransactionReference}) <> ''
      AND ${table.verifiedAt} IS NOT NULL AND ${table.verifiedBy} IS NOT NULL)
  `),
  check("registration_cancellation_consistent", sql`
    (${table.cancelledAt} IS NULL AND ${table.cancelledBy} IS NULL AND ${table.cancellationReason} IS NULL)
    OR (${table.cancelledAt} IS NOT NULL AND ${table.cancelledBy} IS NOT NULL AND NOT ${table.isPaid}
      AND ${table.cancellationReason} IS NOT NULL AND btrim(${table.cancellationReason}) <> '')
  `)
]);

// Remember every accepted submission key, including duplicate registration requests.
// The submission's own key remains its original request identifier.
export const crmSubmissionKey = pgTable("crm_submission_key", {
  key: uuid("key").primaryKey(),
  payloadHash: text("payload_hash").notNull(),
  corporateInquiryId: uuid("corporate_inquiry_id").references(() => corporateInquiry.id, { onDelete: "restrict" }),
  registrationId: uuid("registration_id").references(() => registration.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index("crm_submission_key_inquiry_idx").on(table.corporateInquiryId),
  index("crm_submission_key_registration_idx").on(table.registrationId),
  check("crm_submission_key_one_owner", sql`(${table.corporateInquiryId} IS NOT NULL) <> (${table.registrationId} IS NOT NULL)`),
  check("crm_submission_key_hash_sha256", sql`${table.payloadHash} ~ '^[0-9a-f]{64}$'`)
]);

// Save the message once; application updates change delivery metadata only.
// Use the job UUID as the provider idempotency key on retries.
export const crmEmailJob = pgTable("crm_email_job", {
  id: uuid("id").primaryKey().defaultRandom(),
  corporateInquiryId: uuid("corporate_inquiry_id").references(() => corporateInquiry.id, { onDelete: "restrict" }),
  registrationId: uuid("registration_id").references(() => registration.id, { onDelete: "restrict" }),
  kind: crmEmailKind("kind").notNull(),
  payload: jsonb("payload").$type<CrmEmailPayload>().notNull(),
  state: crmEmailState("state").default(CrmEmailState.Pending).notNull(),
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
  uniqueIndex("crm_email_job_registration_kind_idx").on(table.registrationId, table.kind),
  check("crm_email_job_owner_kind", sql`
    (${table.registrationId} IS NOT NULL AND ${table.corporateInquiryId} IS NULL
      AND ${table.kind}::text IN ('payment_instructions', 'payment_acknowledgment'))
    OR (${table.corporateInquiryId} IS NOT NULL AND ${table.registrationId} IS NULL
      AND ${table.kind}::text IN ('corporate_acknowledgment', 'corporate_notification', 'corporate_overdue'))
  `),
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
