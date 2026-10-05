import { describe, expect, it } from "vitest";

import { assertContentTransition, contentStatusAction } from "@/features/shared/content-status";
import { CmsValidationError } from "@/features/shared/errors";

describe("assertContentTransition", () => {
  it("allows publishing a draft", () => {
    expect(() => assertContentTransition("draft", "published")).not.toThrow();
  });

  it("allows restoring an archived item to draft", () => {
    expect(() => assertContentTransition("archived", "draft")).not.toThrow();
  });

  it("rejects publishing an archived item directly", () => {
    expect(() => assertContentTransition("archived", "published")).toThrow(CmsValidationError);
  });
});

describe("contentStatusAction", () => {
  it("logs archive and restore as their own actions", () => {
    expect(contentStatusAction("published", "archived")).toBe("archive");
    expect(contentStatusAction("archived", "draft")).toBe("restore");
  });

  it("logs publish and unpublish as a status change", () => {
    expect(contentStatusAction("draft", "published")).toBe("status_change");
    expect(contentStatusAction("published", "draft")).toBe("status_change");
  });
});
