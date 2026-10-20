import { describe, expect, it } from "vitest";
import { canRetryInquiryEmail, formatInquiryTime, inquiryErrorMessage, inquiryStatusOptions, isInquiryOverdue } from "./presentation";
import { registrationEmailErrorMessage, registrationErrorMessage } from "./registration-presentation";

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

describe("CRM error messages", () => {
  it.each([
    ["Unauthorized", "Your session has ended. Sign in again."],
    ["origin_not_allowed", "This request was blocked. Open the portal at its configured address and try again."]
  ])("shares the existing message for %s", (code, message) => {
    for (const format of [inquiryErrorMessage, registrationErrorMessage, registrationEmailErrorMessage]) {
      expect(format(new Error(code))).toBe(message);
    }
  });
  it("keeps access, unavailable and email errors specific to the operation", () => {
    for (const code of ["staff_access_required", "access_unavailable", "crm_unavailable", "email_job_not_found"]) {
      expect(inquiryErrorMessage(new Error(code))).toContain("inquiry");
      expect(registrationErrorMessage(new Error(code))).toContain("registration");
    }
    expect(registrationErrorMessage(new Error("registration_session_not_found"))).toContain("workshop run could not be found");
    const error = new Error("email_unavailable");
    expect(inquiryErrorMessage(error)).toContain("Email sending is disabled");
    expect(registrationErrorMessage(error)).toContain("Payment could not be recorded");
    expect(registrationEmailErrorMessage(error)).toContain("Payment status has not changed");
  });
  it("hides unknown failures behind the same safe fallback", () => {
    for (const error of [new Error("private connection details"), null, "Unauthorized"]) {
      for (const format of [inquiryErrorMessage, registrationErrorMessage, registrationEmailErrorMessage]) {
        expect(format(error)).toBe("The request could not be completed. Try again.");
      }
    }
  });
});
