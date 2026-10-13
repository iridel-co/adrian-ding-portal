import { describe, expect, it } from "vitest";

import {
  apiError,
  ApiErrorCode,
  CACHE_CONTROL,
  computeEtag,
  conditionalJson,
  corsHeaders,
  HttpStatus,
  json,
  matchesEtag,
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

  it("allows If-None-Match and exposes ETag", () => {
    const headers = corsHeaders(null, []);
    expect(headers["Access-Control-Allow-Headers"]).toContain("If-None-Match");
    expect(headers["Access-Control-Expose-Headers"]).toBe("ETag");
  });

  it("leaves out the allow header for other origins", () => {
    const headers = corsHeaders("https://evil.com", ["https://site.com"]);
    expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
  });
});

describe("conditional GET", () => {
  const cors = { "Access-Control-Allow-Origin": "*" };
  const request = (ifNoneMatch?: string) =>
    new Request("https://cms.example.com/api/public/programs", {
      headers: ifNoneMatch ? { "If-None-Match": ifNoneMatch } : {}
    });

  it("computes the same strong ETag for the same body", async () => {
    const etag = await computeEtag("[1,2]");
    expect(etag).toMatch(/^"[A-Za-z0-9_-]{43}"$/);
    expect(await computeEtag("[1,2]")).toBe(etag);
    expect(await computeEtag("[1,3]")).not.toBe(etag);
  });

  it("matches exact, weak, listed and wildcard tags", () => {
    expect(matchesEtag('"abc"', '"abc"')).toBe(true);
    expect(matchesEtag('W/"abc"', '"abc"')).toBe(true);
    expect(matchesEtag('"x", "abc"', '"abc"')).toBe(true);
    expect(matchesEtag("*", '"abc"')).toBe(true);
    expect(matchesEtag('"x"', '"abc"')).toBe(false);
    expect(matchesEtag(null, '"abc"')).toBe(false);
  });

  it("returns 200 with an ETag when the client has no copy", async () => {
    const response = await conditionalJson(request(), { ok: true }, cors);
    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe(await computeEtag('{"ok":true}'));
    expect(await response.json()).toEqual({ ok: true });
  });

  it("returns 304 with cache, ETag and CORS headers on a match", async () => {
    const etag = await computeEtag('{"ok":true}');
    const response = await conditionalJson(request(etag), { ok: true }, cors);
    expect(response.status).toBe(304);
    expect(await response.text()).toBe("");
    expect(response.headers.get("ETag")).toBe(etag);
    expect(response.headers.get("Cache-Control")).toBe(CACHE_CONTROL.ok);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 200 when the ETag is stale", async () => {
    const response = await conditionalJson(request('"stale"'), { ok: true }, cors);
    expect(response.status).toBe(200);
  });
});
