import { describe, expect, it } from "vitest";

import { centavosToPesoInput, formatPesos, pesoInputToCentavos } from "@/lib/cms/money";

describe("pesoInputToCentavos", () => {
  it("turns whole pesos into centavos", () => {
    expect(pesoInputToCentavos("6500")).toBe(650000);
  });

  it("accepts a peso sign, commas and cents", () => {
    expect(pesoInputToCentavos("₱6,500.50")).toBe(650050);
  });

  it("returns null for empty, negative or invalid input", () => {
    expect(pesoInputToCentavos("")).toBeNull();
    expect(pesoInputToCentavos("-5")).toBeNull();
    expect(pesoInputToCentavos("abc")).toBeNull();
  });
});

describe("centavosToPesoInput", () => {
  it("shows whole pesos without decimals", () => {
    expect(centavosToPesoInput(650000)).toBe("6500");
  });

  it("shows cents with two decimals", () => {
    expect(centavosToPesoInput(650050)).toBe("6500.50");
  });

  it("shows an empty string for null", () => {
    expect(centavosToPesoInput(null)).toBe("");
  });
});

describe("formatPesos", () => {
  it("formats with the peso sign and thousands separator", () => {
    expect(formatPesos(650000)).toBe("₱6,500");
  });
});
