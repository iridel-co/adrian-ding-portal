import { describe, expect, it } from "vitest";
import { corporateInquirySchema, idempotencyKeySchema } from "./schemas";

const inquiry = {
  fullName: "Maria Santos", email: "maria@example.com", phone: "+63 917 123 4567",
  consent: true, company: "Example Co", role: "HR Manager", program: "Leadership",
  attendees: "16 to 30", targetDateText: "Q1 2027", venue: "Our Cebu office"
};

describe("Corporate inquiry validation", () => {
  it("normalizes contacts and preserves free-text requirements and optional answers", () => {
    expect(corporateInquirySchema.parse({ ...inquiry, email: " MARIA@EXAMPLE.COM ",
      context: " First line\nSecond line ", alsoInterested: [" Communication "]
    })).toEqual({ ...inquiry, targetDateFrom: null, targetDateTo: null, context: "First line\nSecond line", alsoInterested: ["Communication"] });
    expect(corporateInquirySchema.parse(inquiry)).toEqual({ ...inquiry, targetDateFrom: null, targetDateTo: null, context: null, alsoInterested: [] });
  });

  it("requires complete answers and explicit consent", () => {
    for (const field of Object.keys(inquiry)) {
      const missing: Record<string, unknown> = { ...inquiry };
      delete missing[field];
      expect(corporateInquirySchema.safeParse(missing).success, field).toBe(false);
    }
    for (const consent of [false, "true", 1, null]) {
      expect(corporateInquirySchema.safeParse({ ...inquiry, consent }).success).toBe(false);
    }
  });

  it("rejects invalid contacts and client-supplied workflow fields", () => {
    for (const overrides of [{ email: "invalid" }, { phone: "123456" }, { phone: "call me" },
      { phone: "+1234567890123456" }, { status: "WON" }, { slaDueAt: "2026-10-12" }, { consentAt: "2026-10-12" }]) {
      expect(corporateInquirySchema.safeParse({ ...inquiry, ...overrides }).success).toBe(false);
    }
  });

  it("bounds text and programme lists", () => {
    for (const [field, max] of Object.entries({ fullName: 200, email: 254, phone: 40,
      company: 200, role: 200, program: 200, attendees: 100, targetDateText: 200, venue: 300, context: 5000 })) {
      expect(corporateInquirySchema.safeParse({ ...inquiry, [field]: "x".repeat(max + 1) }).success, field).toBe(false);
    }
    for (const alsoInterested of [Array(21).fill("Leadership"), [" "], [123], null]) {
      expect(corporateInquirySchema.safeParse({ ...inquiry, alsoInterested }).success).toBe(false);
    }
  });

  it("validates and normalizes UUID v4 retry keys", () => {
    const key = "12345678-abcd-4000-8000-123456789abc";
    expect(idempotencyKeySchema.parse(key.toUpperCase())).toBe(key);
    for (const invalid of [undefined, "bad", "12345678-abcd-1000-8000-123456789abc"]) {
      expect(idempotencyKeySchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("preserves a single picked date or range, with an optional end date", () => {
    const { targetDateText: _text, ...base } = inquiry;
    const single = corporateInquirySchema.parse({ ...base, targetDateFrom: "2027-01-12", targetDateTo: "" });
    expect(single).toMatchObject({ targetDateFrom: "2027-01-12", targetDateTo: null, targetDateText: null });
    expect(corporateInquirySchema.parse({ ...base, targetDateFrom: "2027-01-12", targetDateTo: "2027-01-14" }))
      .toMatchObject({ targetDateFrom: "2027-01-12", targetDateTo: "2027-01-14" });
    expect(corporateInquirySchema.safeParse({ ...base, targetDateFrom: "2027-01-12", targetDateTo: "2027-01-12" }).success).toBe(true);
  });

  it("rejects reversed ranges, invalid calendar dates, and end dates without a start", () => {
    const { targetDateText: _text, ...base } = inquiry;
    for (const dates of [{ targetDateFrom: "2027-01-12", targetDateTo: "2027-01-11" },
      { targetDateFrom: "2027-02-29" }, { targetDateFrom: "2027-13-01" },
      { targetDateTo: "2027-01-14" }, {}]) {
      expect(corporateInquirySchema.safeParse({ ...base, ...dates }).success).toBe(false);
    }
  });

  it("keeps the rough-date mode separate from picked dates", () => {
    expect(corporateInquirySchema.safeParse({ ...inquiry, targetDateFrom: "2027-01-12" }).success).toBe(false);
    expect(corporateInquirySchema.safeParse({ ...inquiry, targetDateTo: "2027-01-14" }).success).toBe(false);
    expect(corporateInquirySchema.safeParse({ ...inquiry, targetDate: "12 January 2027" }).success).toBe(false);
  });
});
