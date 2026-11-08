import { describe, expect, it } from "vitest";

import { focusFromPoint, nudgeFocus, toObjectPosition } from "./image-focus";

const rect = { left: 100, top: 50, width: 400, height: 200 };

describe("focusFromPoint", () => {
  it("turns a point over the photo into whole percents", () => {
    expect(focusFromPoint({ x: 200, y: 101 }, rect)).toEqual({ x: 25, y: 26 });
  });

  it("clamps a drag past the photo's edges", () => {
    expect(focusFromPoint({ x: 0, y: 999 }, rect)).toEqual({ x: 0, y: 100 });
  });
});

describe("nudgeFocus", () => {
  it("stays inside 0 to 100", () => {
    expect(nudgeFocus({ x: 98, y: 3 }, 5, -5)).toEqual({ x: 100, y: 0 });
  });
});

describe("toObjectPosition", () => {
  it("formats as CSS object-position", () => {
    expect(toObjectPosition({ x: 30, y: 70 })).toBe("30% 70%");
  });
});
