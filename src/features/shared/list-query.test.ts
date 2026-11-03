import { describe, expect, it, vi } from "vitest";

import { escapeLike, fetchPage } from "@/features/shared/list-query";

function fakeQuery(rows: number[]) {
  const limit = vi.fn((count: number) => ({
    offset: (start: number) => Promise.resolve(rows.slice(start, start + count))
  }));
  const query = Object.assign(Promise.resolve(rows), { limit });

  return { query, limit };
}

describe("fetchPage", () => {
  it("returns every row when the page has no limit", async () => {
    const { query, limit } = fakeQuery([1, 2, 3]);

    const page = await fetchPage(query, { offset: 0 });

    expect(page).toEqual({ items: [1, 2, 3], hasMore: false });
    expect(limit).not.toHaveBeenCalled();
  });

  it("reports more rows when the next page has any", async () => {
    const { query } = fakeQuery([1, 2, 3, 4, 5]);

    const page = await fetchPage(query, { limit: 2, offset: 2 });

    expect(page).toEqual({ items: [3, 4], hasMore: true });
  });

  it("reports no more rows on the last page", async () => {
    const { query } = fakeQuery([1, 2, 3, 4, 5]);

    const page = await fetchPage(query, { limit: 2, offset: 4 });

    expect(page).toEqual({ items: [5], hasMore: false });
  });
});

describe("escapeLike", () => {
  it("escapes SQL wildcard characters", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});
