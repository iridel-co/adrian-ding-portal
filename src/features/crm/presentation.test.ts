import { describe, expect, it } from "vitest";
import { canRetryInquiryEmail, formatInquiryTime, inquiryErrorMessage, inquiryStatusOptions, isInquiryOverdue } from "./presentation";

describe("Inquiry screen rules", () => {
  const now = Date.parse("2026-10-12T02:00:00Z");
  it("flags only NEW inquiries after their deadline", () => {
    for (const status of ["CONTACTED", "PROPOSAL_SENT", "WON", "LOST", "SPAM"] as const) {
      expect(isInquiryOverdue({ status, slaDueAt: new Date(now - 1) }, now)).toBe(false);
    }
    expect(isInquiryOverdue({ status: "NEW", slaDueAt: new Date(now) }, now)).toBe(false);
    expect(isInquiryOverdue({ status: "NEW", slaDueAt: new Date(now - 1) }, now)).toBe(true);
  });
  it("offers retry for pending/failed and expired sending leases, never completed jobs", () => {
    for (const state of ["pending", "failed"]) expect(canRetryInquiryEmail({ state, leaseExpiresAt: null }, now)).toBe(true);
    for (const state of ["sent", "skipped", "needs_reconciliation"]) expect(canRetryInquiryEmail({ state, leaseExpiresAt: null }, now)).toBe(false);
    expect(canRetryInquiryEmail({ state: "sending", leaseExpiresAt: new Date(now + 1) }, now)).toBe(false);
    expect(canRetryInquiryEmail({ state: "sending", leaseExpiresAt: new Date(now) }, now)).toBe(true);
  });
  it("provides every filter and shows instants in Manila time", () => {
    expect(inquiryStatusOptions.map(option => option.value)).toEqual(["all", "non-spam", "NEW", "CONTACTED", "PROPOSAL_SENT", "WON", "LOST", "SPAM"]);
    expect(formatInquiryTime("2026-10-11T16:00:00Z")).toContain("Oct 12, 2026");
    expect(formatInquiryTime("2026-10-11T16:00:00Z")).toContain("12:00 AM");
  });
  it("explains conflicts and hides unknown server errors", () => {
    expect(inquiryErrorMessage(new Error("inquiry_status_changed"))).toContain("Your input has been kept");
    expect(inquiryErrorMessage(new Error("private connection data"))).not.toContain("private");
  });
});
