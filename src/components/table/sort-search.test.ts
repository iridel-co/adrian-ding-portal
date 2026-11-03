import { describe, expect, it } from "vitest";

import { nextSort } from "@/components/table/sort-search";

describe("nextSort", () => {
  it("starts a new column ascending on the first page", () => {
    expect(nextSort({ sort: "title", direction: "desc" }, "status")).toEqual({
      sort: "status",
      direction: "asc",
      offset: 0
    });
  });

  it("flips an ascending column to descending", () => {
    expect(nextSort({ sort: "title", direction: "asc" }, "title")).toMatchObject({
      direction: "desc"
    });
  });

  it("flips a descending column to ascending", () => {
    expect(nextSort({ sort: "title", direction: "desc" }, "title")).toMatchObject({
      direction: "asc"
    });
  });

  it("starts ascending when nothing is sorted yet", () => {
    expect(nextSort({ direction: "desc" }, "date")).toMatchObject({ direction: "asc" });
  });
});
