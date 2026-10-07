import { describe, expect, it } from "vitest";

import { corporateInquirySchema, idempotencyKeySchema, registrationSchema } from "./schemas";

const registration = {
  workshopSessionId: "12345678-abcd-4000-8000-123456789abc",
  fullName: "María Santos",
  email: "maria@example.com",
  phone: "+63 (917) 123-4567",
  occupation: "Engineer",
  salaryRange: "Prefer not to say",
  consent: true
};
const inquiry = {
  fullName: registration.fullName,
  email: registration.email,
  phone: registration.phone,
  consent: true,
  company: "Example Co",
  role: "HR Manager",
  program: "Not sure yet — help us scope it",
  attendees: "16 – 30",
  targetDate: "Second week of November, or Q1 2027",
  venue: "Our Cebu office"
};
const submissions = [
  { schema: registrationSchema, input: registration },
  { schema: corporateInquirySchema, input: inquiry }
];

describe("CRM submission validation", () => {
  it("normalizes contacts and session IDs while preserving workshop fields", () => {
    expect(registrationSchema.parse({
      ...registration,
      workshopSessionId: registration.workshopSessionId.toUpperCase(),
      fullName: "  María Santos  ",
      email: "  MARIA@EXAMPLE.COM  ",
      phone: "  +63 (917) 123-4567  ",
      occupation: "  Engineer  ",
      city: "  Cebu City  "
    })).toEqual({ ...registration, city: "Cebu City" });
  });

  it("preserves corporate descriptions and all optional fields", () => {
    expect(corporateInquirySchema.parse({
      ...inquiry,
      context: "  First line\nSecond line  ",
      alsoInterested: ["  Leadership  ", "Communication"]
    })).toEqual({ ...inquiry, context: "First line\nSecond line", alsoInterested: ["Leadership", "Communication"] });
    expect(registrationSchema.parse(registration).city).toBeNull();
    expect(registrationSchema.parse({ ...registration, city: "  " }).city).toBeNull();
    expect(corporateInquirySchema.parse(inquiry)).toEqual({ ...inquiry, context: null, alsoInterested: [] });
    expect(corporateInquirySchema.parse({ ...inquiry, context: "  " }).context).toBeNull();
  });

  it("requires every required field and explicit boolean consent", () => {
    for (const { schema, input } of submissions) {
      for (const field of Object.keys(input)) {
        const missing: Record<string, unknown> = { ...input };
        delete missing[field];
        expect(schema.safeParse(missing).success, `missing ${field}`).toBe(false);
      }
      for (const consent of [false, "true", 1, null]) {
        expect(schema.safeParse({ ...input, consent }).success).toBe(false);
      }
    }
  });

  it("rejects blank/invalid contacts, wrong types, and malformed identifiers", () => {
    for (const { schema, input } of submissions) {
      for (const overrides of [
        { fullName: " " }, { email: "not-an-email" }, { phone: "call me" },
        { phone: "123456" }, { phone: "+1234567890123456" },
        { fullName: 123 }, { email: null }, { phone: 9171234567 }
      ]) expect(schema.safeParse({ ...input, ...overrides }).success).toBe(false);
    }
    for (const workshopSessionId of ["bad", null, 123]) {
      expect(registrationSchema.safeParse({ ...registration, workshopSessionId }).success).toBe(false);
    }
    expect(registrationSchema.safeParse({ ...registration, occupation: " " }).success).toBe(false);
    expect(registrationSchema.safeParse({ ...registration, salaryRange: " " }).success).toBe(false);
    for (const field of ["company", "role", "program", "attendees", "targetDate", "venue"]) {
      expect(corporateInquirySchema.safeParse({ ...inquiry, [field]: " " }).success).toBe(false);
    }
  });

  it("rejects unknown fields instead of silently removing server-controlled values", () => {
    for (const { schema, input } of submissions) {
      for (const [field, value] of Object.entries({
        priceCentavos: 1, paymentStatus: "paid", consentAt: "2026-10-06", quantity: 2,
        qrUrl: "https://example.com/qr.png", idempotencyKey: registration.workshopSessionId,
        unexpected: "value"
      })) expect(schema.safeParse({ ...input, [field]: value }).success, field).toBe(false);
    }
  });

  it("bounds text, optional values, and programme lists", () => {
    for (const { schema, input } of submissions) {
      for (const [field, max] of Object.entries({ fullName: 200, email: 254, phone: 40 })) {
        expect(schema.safeParse({ ...input, [field]: "x".repeat(max + 1) }).success, field).toBe(false);
      }
    }
    for (const [field, max] of Object.entries({ occupation: 200, salaryRange: 100, city: 200 })) {
      expect(registrationSchema.safeParse({ ...registration, [field]: "x".repeat(max + 1) }).success, field).toBe(false);
    }
    for (const [field, max] of Object.entries({ company: 200, role: 200, program: 200, attendees: 100, targetDate: 200, venue: 300, context: 5000 })) {
      expect(corporateInquirySchema.safeParse({ ...inquiry, [field]: "x".repeat(max + 1) }).success, field).toBe(false);
    }
    for (const alsoInterested of [Array(21).fill("Leadership"), ["x".repeat(201)], [" "], [123], "Leadership", null]) {
      expect(corporateInquirySchema.safeParse({ ...inquiry, alsoInterested }).success).toBe(false);
    }
    expect(registrationSchema.safeParse({ ...registration, city: null }).success).toBe(false);
    expect(corporateInquirySchema.safeParse({ ...inquiry, context: {} }).success).toBe(false);
  });

  it("accepts values at the documented length and list limits", () => {
    expect(registrationSchema.safeParse({ ...registration, fullName: "x".repeat(200), occupation: "x".repeat(200), salaryRange: "x".repeat(100), city: "x".repeat(200) }).success).toBe(true);
    expect(corporateInquirySchema.safeParse({ ...inquiry, company: "x".repeat(200), role: "x".repeat(200), program: "x".repeat(200), attendees: "x".repeat(100), targetDate: "x".repeat(200), venue: "x".repeat(300), context: "x".repeat(5000), alsoInterested: Array(20).fill("x".repeat(200)) }).success).toBe(true);
  });

  it("validates and canonicalizes the random UUID request header", () => {
    const key = registration.workshopSessionId;
    expect(idempotencyKeySchema.parse(key.toUpperCase())).toBe(key);
    for (const value of [undefined, null, "", "bad", `${key},${key}`, "12345678-abcd-1000-8000-123456789abc"]) {
      expect(idempotencyKeySchema.safeParse(value).success).toBe(false);
    }
  });
});
