import { workshopSort, registrantSort, sortDirection } from "./sorting";
import { z } from "zod";
import { paymentMethod } from "@/db/schema";
import { inquiryPageSchema as pageSchema } from "./schemas";

export const registrationSessionListSchema = pageSchema.extend({
  sort: workshopSort, direction: sortDirection,
  when: z.enum(["upcoming", "past", "all"]).default("upcoming"),
  workshopId: z.uuid().optional()
});

export const registrationListSchema = pageSchema.extend({
  sort: registrantSort, direction: sortDirection,
  workshopSessionId: z.uuid(),
  filter: z.enum(["active", "unpaid", "paid", "cancelled", "all"]).default("active"),
  search: z.string().trim().max(200).default("")
});

export const registrationDetailSchema = pageSchema.extend({ id: z.uuid() });

export enum RegistrationAction {
  MarkPaid = "mark_paid",
  CorrectPayment = "correct_payment",
  Cancel = "cancel"
}

const expected = { id: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: true }) };
const reason = z.string().trim().min(1).max(2000);
export const registrationActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ ...expected, action: z.literal(RegistrationAction.MarkPaid), expectedIsPaid: z.literal(false),
    paymentMethod: z.enum(paymentMethod.enumValues), paidAmountCentavos: z.number().int().min(0).max(2147483647),
    payerName: z.string().trim().min(1).max(200), providerTransactionReference: z.string().trim().min(1).max(200) }),
  z.strictObject({ ...expected, action: z.literal(RegistrationAction.CorrectPayment), expectedIsPaid: z.literal(true), reason }),
  z.strictObject({ ...expected, action: z.literal(RegistrationAction.Cancel), expectedIsPaid: z.literal(false), reason })
]);

export const registrationEmailRetrySchema = z.strictObject({ registrationId: z.uuid(), jobId: z.uuid() });
