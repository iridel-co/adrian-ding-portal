import { describe, expect, it } from "vitest";

import { errorMessage } from "@/features/shared/error-message";

describe("errorMessage", () => {
  it("shows the first message of a validation issue list", () => {
    const issues = [{ code: "custom", path: ["values", "endDate"], message: "Pick a date." }];

    expect(errorMessage(new Error(JSON.stringify(issues)))).toBe("Pick a date.");
  });

  it("keeps a plain error message", () => {
    expect(errorMessage(new Error("Course code CFM is taken."))).toBe("Course code CFM is taken.");
  });

  it("falls back for anything that is not an error", () => {
    expect(errorMessage("nope")).toBe("Something went wrong. Try again.");
  });
});
