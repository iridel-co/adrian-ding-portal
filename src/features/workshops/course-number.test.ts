import { describe, expect, it } from "vitest";

import { displayCourseCode, nextCourseCode } from "@/features/workshops/course-number";

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
