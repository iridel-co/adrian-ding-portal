import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CmsValidationError } from "@/features/shared/errors";
import { errorMessage, formErrors } from "@/features/shared/error-message";
import { assertPublishable, findMissingFields } from "@/features/shared/publish";

const publishSchema = z.object({
  title: z.string().min(1),
  heroMediaId: z.uuid(),
  outcomes: z.array(z.string()).min(1)
});

const labels = {
  title: "Title",
  heroMediaId: "Hero image",
  outcomes: "Outcomes"
};

describe("findMissingFields", () => {
  it("returns the labels of the fields that fail", () => {
    const item = { title: "Coaching", heroMediaId: null, outcomes: [] };

    expect(findMissingFields(publishSchema, item, labels)).toEqual(["Hero image", "Outcomes"]);
  });

  it("returns an empty list for a complete item", () => {
    const item = {
      title: "Coaching",
      heroMediaId: "6f1c1f4e-6f0a-4a4e-9a57-3c1d2b7c8e90",
      outcomes: ["Lead"]
    };

    expect(findMissingFields(publishSchema, item, labels)).toEqual([]);
  });
});

describe("assertPublishable", () => {
  it("throws a validation error that names the missing fields", () => {
    const item = { title: "", heroMediaId: null, outcomes: ["Lead"] };

    expect(() => assertPublishable(publishSchema, item, labels)).toThrow(CmsValidationError);
    expect(errorMessage(thrownBy(item))).toBe("Fill these before publishing: Title, Hero image.");
  });

  it("marks each missing field", () => {
    const item = { title: "", heroMediaId: null, outcomes: ["Lead"] };

    expect(formErrors(thrownBy(item), ["title", "heroMediaId", "outcomes"])).toEqual({
      byField: {
        title: ["Fill this before publishing."],
        heroMediaId: ["Fill this before publishing."]
      },
      general: ["Fill these before publishing: Title, Hero image."]
    });
  });

  it("does not throw for a complete item", () => {
    const item = {
      title: "Coaching",
      heroMediaId: "6f1c1f4e-6f0a-4a4e-9a57-3c1d2b7c8e90",
      outcomes: ["Lead"]
    };

    expect(() => assertPublishable(publishSchema, item, labels)).not.toThrow();
  });
});

function thrownBy(item: unknown) {
  try {
    assertPublishable(publishSchema, item, labels);
  } catch (error) {
    return error;
  }

  return null;
}
