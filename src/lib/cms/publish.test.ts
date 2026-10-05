import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CmsValidationError } from "@/lib/cms/errors";
import { assertPublishable, findMissingFields } from "@/lib/cms/publish";

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
    expect(() => assertPublishable(publishSchema, item, labels)).toThrow(
      "Fill these before publishing: Title, Hero image."
    );
  });
});
