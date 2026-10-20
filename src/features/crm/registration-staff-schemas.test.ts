import { expect, it } from "vitest";
import { RegistrationAction, registrationActionSchema, registrationListSchema, registrationSessionListSchema } from "./registration-staff-schemas";
const base = { id: "12345678-abcd-4000-8000-123456789abc", expectedUpdatedAt: "2026-10-18T02:00:00.000Z" };
const paid = { ...base, action: RegistrationAction.MarkPaid, expectedIsPaid: false, paymentMethod: "bank",
  paidAmountCentavos: 10000, payerName: "Synthetic Payer", providerTransactionReference: "transaction-1" };
it.each(["bank", "gcash", "maya"])("accepts complete verification using %s", paymentMethod => {
  expect(registrationActionSchema.parse({ ...paid, paymentMethod, payerName: " Synthetic Payer " })).toMatchObject({ payerName: "Synthetic Payer", paymentMethod });
});
it.each([
  { paymentMethod: "cash" }, { paidAmountCentavos: -1 }, { paidAmountCentavos: 1.5 }, { paidAmountCentavos: 2147483648 },
  { payerName: " " }, { providerTransactionReference: " " }, { expectedIsPaid: true }, { expectedIsPaid: "unpaid" }, { expectedIsPaid: null }, { expectedIsPaid: undefined },
  { expectedUpdatedAt: "bad" }, { expectedUpdatedAt: undefined }, { verifiedBy: "spoofed" }, { proof: "upload" }, { reason: "unused" }
])("rejects invalid verification or unaccepted fields", change => {
  expect(registrationActionSchema.safeParse({ ...paid, ...change }).success).toBe(false);
});
it("accepts zero paid amount for zero-price workshops", () => {
  expect(registrationActionSchema.safeParse({ ...paid, paidAmountCentavos: 0 }).success).toBe(true);
});
it.each([RegistrationAction.CorrectPayment, RegistrationAction.Cancel])("requires a reason and correct expected state for %s", action => {
  const input = { ...base, action, expectedIsPaid: action !== RegistrationAction.Cancel, reason: " Staff correction " };
  expect(registrationActionSchema.parse(input)).toMatchObject({ reason: "Staff correction" });
  for (const reason of [undefined, "", "   "]) expect(registrationActionSchema.safeParse({ ...input, reason }).success).toBe(false);
  expect(registrationActionSchema.safeParse({ ...input, expectedIsPaid: action === RegistrationAction.Cancel }).success).toBe(false);
  expect(registrationActionSchema.safeParse({ ...input, paymentMethod: "bank" }).success).toBe(false);
});
it("bounds list filters and pagination", () => {
  expect(registrationListSchema.parse({ workshopSessionId: base.id })).toMatchObject({ filter: "active", limit: 50, offset: 0 });
  expect(registrationListSchema.safeParse({ workshopSessionId: base.id, filter: "waitlist" }).success).toBe(false);
  expect(registrationListSchema.safeParse({ workshopSessionId: base.id, limit: 101 }).success).toBe(false);
  expect(registrationSessionListSchema.parse({})).toMatchObject({ when: "upcoming" });
  expect(registrationSessionListSchema.safeParse({ when: "future" }).success).toBe(false);
});

it.each([
  ["mark_paid", RegistrationAction.MarkPaid],
  ["correct_payment", RegistrationAction.CorrectPayment],
  ["cancel", RegistrationAction.Cancel]
])("preserves the API action value %s", (action, expectedAction) => {
  const input = action === "mark_paid" ? { ...paid, action } : {
    ...base, action, expectedIsPaid: action === "correct_payment", reason: "Staff reason"
  };
  expect(registrationActionSchema.parse(input).action).toBe(expectedAction);
});

it.each([RegistrationAction.MarkPaid, RegistrationAction.CorrectPayment, RegistrationAction.Cancel])(
  "rejects a caller-supplied reference on %s", action => {
    const input = action === RegistrationAction.MarkPaid ? paid : {
      ...base, action, expectedIsPaid: action === RegistrationAction.CorrectPayment, reason: "Staff reason"
    };
    expect(registrationActionSchema.safeParse({ ...input, reference: "AD-TEST-9999" }).success).toBe(false);
  }
);
