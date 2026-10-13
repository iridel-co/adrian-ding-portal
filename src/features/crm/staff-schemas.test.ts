import { describe, expect, it } from "vitest";
import { inquiryListSchema, inquiryPageSchema, inquiryTransitionSchema } from "./schemas";

describe("Staff inquiry inputs", () => {
  it("accepts All, Non-spam and every lifecycle state with bounded pagination", () => {
    for (const status of ["all", "non-spam", "NEW", "CONTACTED", "PROPOSAL_SENT", "WON", "LOST", "SPAM"]) {
      expect(inquiryListSchema.parse({ status }).status).toBe(status);
    }
    expect(inquiryListSchema.parse({ search: " Sample " })).toMatchObject({ search: "Sample", limit: 50, offset: 0 });
    for (const input of [{ limit: 101 }, { limit: 0 }, { offset: -1 }, { offset: 100001 }, { offset: 1.5 }]) {
      expect(inquiryPageSchema.safeParse(input).success).toBe(false);
    }
    expect(inquiryListSchema.safeParse({ status: "other" }).success).toBe(false);
    expect(inquiryListSchema.safeParse({ search: "a".repeat(201) }).success).toBe(false);
  });
  it("requires the expected status and rejects unauthorized extra mutation fields", () => {
    expect(inquiryTransitionSchema.safeParse({ status: "CONTACTED" }).success).toBe(false);
    expect(inquiryTransitionSchema.safeParse({ status: "CONTACTED", expectedStatus: "NEW", contactedAt: "invented" }).success).toBe(false);
  });
});
