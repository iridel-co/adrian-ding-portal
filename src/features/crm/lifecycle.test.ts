import { describe, expect, it } from "vitest";
import { corporateInquiryStatus } from "@/db/schema/crm";
import { assertInquiryTransition, type InquiryStatus } from "./lifecycle";
import { inquiryTransitionSchema } from "./schemas";
import { inquiryDeadline } from "./deadline";

describe("Corporate inquiry lifecycle", () => {
  it("permits exactly the FSD transitions, without reopening terminal states", () => {
    const allowed = ["NEW:CONTACTED", "NEW:LOST", "NEW:SPAM", "CONTACTED:PROPOSAL_SENT",
      "CONTACTED:LOST", "PROPOSAL_SENT:WON", "PROPOSAL_SENT:LOST"];
    for (const from of corporateInquiryStatus.enumValues) {
      for (const to of corporateInquiryStatus.enumValues) {
        if (allowed.includes(`${from}:${to}`)) expect(() => assertInquiryTransition(from, to)).not.toThrow();
        else expect(() => assertInquiryTransition(from, to)).toThrow("invalid_inquiry_transition");
      }
    }
  });

  it("requires proposal value and loss reason, and rejects fields for the wrong action", () => {
    const action = (status: InquiryStatus, extra = {}) => inquiryTransitionSchema.safeParse({ expectedStatus: "CONTACTED", status, ...extra });
    expect(action("PROPOSAL_SENT").success).toBe(false);
    expect(action("PROPOSAL_SENT", { estimatedValueCentavos: 0 }).success).toBe(true);
    for (const value of [-1, 1.5, 2147483648]) expect(action("PROPOSAL_SENT", { estimatedValueCentavos: value }).success).toBe(false);
    expect(action("LOST").success).toBe(false);
    expect(action("LOST", { lostReason: "  " }).success).toBe(false);
    expect(action("LOST", { lostReason: "Budget unavailable" }).success).toBe(true);
    expect(action("WON", { lostReason: "Unexpected" }).success).toBe(false);
    expect(action("CONTACTED", { estimatedValueCentavos: 1 }).success).toBe(false);
    expect(action("NEW").success).toBe(false);
  });

  it("counts Manila weekdays and preserves local time across weekends and UTC boundaries", () => {
    for (const [start, end] of [
      ["2026-10-12T10:00:00+08:00", "2026-10-14T10:00:00+08:00"],
      ["2026-10-16T10:00:00+08:00", "2026-10-20T10:00:00+08:00"],
      ["2026-10-17T10:00:00+08:00", "2026-10-20T10:00:00+08:00"],
      ["2026-10-18T00:30:00+08:00", "2026-10-20T00:30:00+08:00"],
      ["2026-12-31T23:45:00.123+08:00", "2027-01-04T23:45:00.123+08:00"]
    ]) {
      const input = new Date(start);
      expect(inquiryDeadline(input).toISOString()).toBe(new Date(end).toISOString());
      expect(input.toISOString()).toBe(new Date(start).toISOString());
    }
    expect(() => inquiryDeadline(new Date("invalid"))).toThrow("Invalid submission time");
  });
});
