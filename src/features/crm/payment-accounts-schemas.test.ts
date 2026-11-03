import { describe, expect, it } from "vitest";

import { createPaymentAccountInput, paymentAccountListInput } from "./payment-accounts-schemas";

describe("payment account inputs", () => {
  it("accepts a complete account and defaults the archive filter", () => {
    expect(createPaymentAccountInput.parse({
      method: "gcash",
      providerName: "GCash",
      accountName: "Adrian Ding",
      accountNumber: "09171234567",
      qrMediaId: "123e4567-e89b-12d3-a456-426614174000"
    })).toMatchObject({ method: "gcash", providerName: "GCash" });
    expect(paymentAccountListInput.parse({})).toEqual({ includeArchived: false, limit: 25, offset: 0, sort: "isActive", direction: "desc" });
  });

  it("rejects a missing QR or unsupported payment channel", () => {
    expect(() => createPaymentAccountInput.parse({
      method: "cash",
      providerName: "Cash",
      accountName: "Adrian Ding",
      accountNumber: "123"
    })).toThrow();
  });
});
