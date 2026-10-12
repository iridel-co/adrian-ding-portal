import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { acceptCorporateInquiry } from "./service";
import { corporateInquirySchema, type CorporateInquiryInput } from "./schemas";

describe("Corporate inquiry consent gate", () => {
  it("rejects missing or false consent before any database access, even if a caller bypasses validation", async () => {
    const transaction = vi.fn();
    const db = { transaction } as unknown as Db;
    const answers = corporateInquirySchema.parse({ fullName: "Test Lead", email: "test@example.invalid",
      phone: "+639171234567", consent: true, company: "Test Company", role: "HR Manager",
      program: "Leadership", attendees: "16 to 30", targetDateFrom: "2027-01-12", venue: "Our office" });
    const config = { EMAIL_FROM: "test@example.invalid", EMAIL_REPLY_TO: "sales@example.invalid",
      CORPORATE_INQUIRY_RECIPIENTS: ["team@example.invalid"] };
    for (const consent of [false, undefined, null, "true", 1]) {
      const input = { ...answers, consent } as unknown as CorporateInquiryInput;
      await expect(acceptCorporateInquiry(db, input, "12345678-abcd-4000-8000-123456789abc", config))
        .rejects.toMatchObject({ status: 400, code: "consent_required" });
    }
    expect(transaction).not.toHaveBeenCalled();
  });
});
