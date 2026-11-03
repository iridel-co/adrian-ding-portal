import { describe, expect, it } from "vitest";

import { errorMessage, formErrors } from "@/features/shared/error-message";

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

describe("formErrors", () => {
  it("groups every validation issue under its field", () => {
    const issues = [
      { path: ["values", "title"], message: "Enter a title." },
      { path: ["values", "outcomes", 2], message: "Fill in the outcome." },
      { path: ["values", "title"], message: "Use fewer words." }
    ];

    const errors = formErrors(new Error(JSON.stringify(issues)), ["title", "outcomes"]);

    expect(errors).toEqual({
      byField: {
        title: ["Enter a title.", "Use fewer words."],
        outcomes: ["Fill in the outcome."]
      },
      general: []
    });
  });

  it("keeps issues for fields the form does not show as general errors", () => {
    const issues = [{ path: ["values", "heroMediaId"], message: "Invalid UUID" }];

    const errors = formErrors(new Error(JSON.stringify(issues)), ["title"]);

    expect(errors).toEqual({
      byField: {},
      general: ["Invalid UUID"]
    });
  });

  it("shows a plain error message as a general error", () => {
    const errors = formErrors(new Error("Course code CFM is taken."), ["courseCode"]);

    expect(errors).toEqual({
      byField: {},
      general: ["Course code CFM is taken."]
    });
  });
});
