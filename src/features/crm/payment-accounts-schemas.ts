import { z } from "zod";

import { paymentMethod } from "@/db/schema";
import { pageOffset, pageSize, paginationSearchSchema, sortDirection } from "@/features/shared/pagination";
import { paymentAccountSort } from "./sorting";

export const paymentMethodSchema = z.enum(paymentMethod.enumValues);

const accountFields = {
  method: paymentMethodSchema,
  providerName: z.string().trim().min(1, "Enter the payment channel.").max(120),
  accountName: z.string().trim().min(1, "Enter the account name.").max(160),
  accountNumber: z.string().trim().min(1, "Enter the account number.").max(160),
  qrMediaId: z.uuid("Choose a payment QR image.")
};

export const paymentAccountListInput = z.object({
  includeArchived: z.boolean().default(false),
  limit: pageSize,
  offset: pageOffset,
  sort: paymentAccountSort,
  direction: sortDirection
});
export const paymentAccountSearchSchema = z.object({
  includeArchived: z.boolean().default(false),
  sort: paymentAccountSort,
  direction: sortDirection
}).and(paginationSearchSchema);
export const createPaymentAccountInput = z.object(accountFields);
export const updatePaymentAccountInput = z.object({ id: z.uuid(), ...accountFields });
export const paymentAccountIdInput = z.object({ id: z.uuid() });

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;
