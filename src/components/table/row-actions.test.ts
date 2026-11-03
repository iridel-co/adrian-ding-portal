import { describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { countOf, runBulk } from "./row-actions";

describe("bulk actions", () => {
  it("runs every row, counts what worked and names what didn't", async () => {
    const run = vi.fn(async (row: { name: string }) => {
      if (row.name === "Beta") throw new Error("Add a title before publishing.");
    });
    await runBulk([{ name: "Alpha" }, { name: "Beta" }, { name: "Gamma" }], run, {
      name: (row) => row.name,
      done: (count) => `Published ${countOf(count, "workshop")}.`
    });
    expect(run).toHaveBeenCalledTimes(3);
    expect(toast.success).toHaveBeenCalledWith("Published 2 workshops.");
    expect(toast.error).toHaveBeenCalledWith("1 couldn't be changed.", { description: expect.stringContaining("Beta: ") });
  });

  it("uses the right plural", () => {
    expect(countOf(1, "inquiry", "inquiries")).toBe("1 inquiry");
    expect(countOf(3, "inquiry", "inquiries")).toBe("3 inquiries");
    expect(countOf(2, "session")).toBe("2 sessions");
  });
});
