import { describe, expect, it } from "vitest";

import {
  PROGRAM_FIELD_LABELS,
  programPublishSchema,
  programSaveSchema
} from "@/features/corporate-trainings/schemas";
import { findMissingFields } from "@/features/shared/publish";

const IMAGE_ID = "6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e";

describe("programSaveSchema", () => {
  it("drops empty useful-for items and trims the rest", () => {
    const parsed = programSaveSchema.parse({
      title: " Keynotes ",
      slug: "keynotes",
      summary: "",
      imageMediaId: null,
      usefulFor: [" Sales summits ", "", "  "]
    });

    expect(parsed.title).toBe("Keynotes");
    expect(parsed.usefulFor).toEqual(["Sales summits"]);
  });

  it("rejects an empty title", () => {
    const result = programSaveSchema.safeParse({
      title: " ",
      slug: "",
      summary: "",
      imageMediaId: null,
      usefulFor: []
    });

    expect(result.success).toBe(false);
  });
});

describe("programPublishSchema", () => {
  it("names the card image and the useful-for list when they are missing", () => {
    const missing = findMissingFields(
      programPublishSchema,
      {
        title: "Keynotes",
        slug: "keynotes",
        summary: "High-energy keynotes.",
        imageMediaId: null,
        usefulFor: []
      },
      PROGRAM_FIELD_LABELS
    );

    expect(missing).toEqual(["Card image", "At least one \"Useful for\" item"]);
  });

  it("accepts a complete program", () => {
    const missing = findMissingFields(
      programPublishSchema,
      {
        title: "Keynotes",
        slug: "keynotes",
        summary: "High-energy keynotes.",
        imageMediaId: IMAGE_ID,
        usefulFor: ["Sales summits"]
      },
      PROGRAM_FIELD_LABELS
    );

    expect(missing).toEqual([]);
  });
});
