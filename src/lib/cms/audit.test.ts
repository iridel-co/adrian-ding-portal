import { describe, expect, it } from "vitest";

import { diffChanges } from "@/lib/cms/audit";

describe("diffChanges", () => {
  it("returns only the fields that changed, with old and new values", () => {
    const before = { title: "Old", summary: "Same" };
    const after = { title: "New", summary: "Same" };

    expect(diffChanges(before, after)).toEqual({ title: { from: "Old", to: "New" } });
  });

  it("compares lists by value", () => {
    const before = { outcomes: ["a", "b"] };

    expect(diffChanges(before, { outcomes: ["a", "b"] })).toEqual({});
    expect(diffChanges(before, { outcomes: ["b", "a"] })).toEqual({
      outcomes: { from: ["a", "b"], to: ["b", "a"] }
    });
  });

  it("records a field that was missing before", () => {
    expect(diffChanges({}, { primerVideoUrl: "https://x.test" })).toEqual({
      primerVideoUrl: { from: undefined, to: "https://x.test" }
    });
  });
});
