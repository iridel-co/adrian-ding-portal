import { describe, expect, it } from "vitest";

import { displayCourseCode, nextCourseCode, workshopSlug } from "@/features/workshops/course-number";

describe("nextCourseCode", () => {
  it("starts at 001 when no course has a number", () => {
    expect(nextCourseCode(null)).toBe("001");
  });

  it("follows the highest number in use", () => {
    expect(nextCourseCode(6)).toBe("007");
  });

  it("widens past 999 instead of wrapping", () => {
    expect(nextCourseCode(999)).toBe("1000");
  });
});

describe("displayCourseCode", () => {
  it("adds the reference prefix", () => {
    expect(displayCourseCode("001")).toBe("AD-001");
  });
});

describe("workshopSlug", () => {
  it("joins the title and the course code", () => {
    expect(workshopSlug("Coaching for Managers", "001")).toBe("coaching-for-managers-001");
  });

  it("lowercases a letter code", () => {
    expect(workshopSlug("Coaching for Managers", "CFM")).toBe("coaching-for-managers-cfm");
  });

  it("falls back when the title has no letters or digits", () => {
    expect(workshopSlug("!!!", "002")).toBe("workshop-002");
  });
});
