import { describe, expect, it } from "vitest";

import {
  apiError,
  ApiErrorCode,
  CACHE_CONTROL,
  corsHeaders,
  HttpStatus,
  json,
  toPrice,
  toPublicMedia
} from "@/features/shared/public-api";

const toUrl = (key: string) => `https://cdn.example.com/${key}`;

describe("toPublicMedia", () => {
  it("builds an absolute url with alt text and size", () => {
    const row = { key: "logos/hsbc.png", alt: "HSBC", width: 200, height: 80 };
    expect(toPublicMedia(row, toUrl)).toEqual({
      url: "https://cdn.example.com/logos/hsbc.png",
      alt: "HSBC",
      width: 200,
      height: 80
    });
  });

  it("returns null when there is no image", () => {
    expect(toPublicMedia(null, toUrl)).toBeNull();
    expect(toPublicMedia(undefined, toUrl)).toBeNull();
  });
});

describe("toPrice", () => {
  it("returns centavos in PHP with the note", () => {
    expect(toPrice(650000, "")).toEqual({ centavos: 650000, currency: "PHP", note: "" });
  });

  it("returns null when there is no price", () => {
    expect(toPrice(null, "")).toBeNull();
  });
});

describe("responses", () => {
  it("caches successful responses", () => {
    const response = json({ ok: true }, CACHE_CONTROL.ok, {});
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage");
    expect(response.headers.get("Cache-Control")).toContain("stale-while-revalidate");
  });

  it("caches 404s briefly and never caches 400s", async () => {
    const notFound = apiError(HttpStatus.NotFound, ApiErrorCode.NotFound, "Not found.");
    expect(notFound.headers.get("Cache-Control")).toBe(CACHE_CONTROL.notFound);

    const invalid = apiError(HttpStatus.BadRequest, ApiErrorCode.InvalidRequest, "group: Invalid option");
    expect(invalid.headers.get("Cache-Control")).toBe("no-store");
    expect(await invalid.json()).toEqual({
      error: { code: "invalid_request", message: "group: Invalid option" }
    });
  });
});

describe("corsHeaders", () => {
  it("allows any origin when none are configured", () => {
    expect(corsHeaders("https://a.com", [])["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("echoes a configured origin", () => {
    const headers = corsHeaders("https://site.com", ["https://site.com"]);
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://site.com");
    expect(headers.Vary).toBe("Origin");
  });

  it("leaves out the allow header for other origins", () => {
    const headers = corsHeaders("https://evil.com", ["https://site.com"]);
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});
