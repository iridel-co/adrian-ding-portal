import { describe, expect, it } from "vitest";

import { isValidSlug, slugify } from "@/lib/cms/slug";

describe("slugify", () => {
  it("turns a title into lowercase words joined by hyphens", () => {
    expect(slugify("Coaching for Managers")).toBe("coaching-for-managers");
  });

  it("spells out the ampersand", () => {
    expect(slugify("Leadership Training & Development")).toBe(
      "leadership-training-and-development"
    );
  });

  it("removes accents and punctuation", () => {
    expect(slugify("  Nestlé — Keynote!  ")).toBe("nestle-keynote");
  });
});

describe("isValidSlug", () => {
  it("accepts lowercase words joined by single hyphens", () => {
    expect(isValidSlug("train-the-trainers-2026")).toBe(true);
  });

  it("rejects uppercase letters", () => {
    expect(isValidSlug("Coaching")).toBe(false);
  });

  it("rejects leading, trailing and double hyphens", () => {
    expect(isValidSlug("-a")).toBe(false);
    expect(isValidSlug("a-")).toBe(false);
    expect(isValidSlug("a--b")).toBe(false);
  });
});
