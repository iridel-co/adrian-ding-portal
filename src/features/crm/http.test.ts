import { describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import type { CrmEnv } from "@/lib/env";

vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: () => { throw new Error("No database access in HTTP boundary checks"); } }));
import { handleSubmission } from "./http";
import { getCrmEnv } from "@/lib/env";

const key = "12345678-abcd-4000-8000-123456789abc";
const config: CrmEnv = {
  CRM_INTAKE_ENABLED: true, SITE_ORIGINS: ["http://localhost:3001"], PAYMENT_ACCOUNT_ID: key,
  RESEND_API_KEY: "synthetic", EMAIL_FROM: "CRM Test <crm@example.com>", EMAIL_REPLY_TO: "team@example.com",
  CORPORATE_INQUIRY_RECIPIENTS: ["team@example.com"]
};
const dependencies = { db: {} as Db, config };
const request = (body: string, headers: Record<string, string> = {}) => new Request("http://localhost/api/registrations", {
  method: "POST", headers: { "content-type": "application/json", "idempotency-key": key, origin: config.SITE_ORIGINS[0], ...headers }, body
});

describe("CRM HTTP boundary", () => {
  it("allows only configured origins and the intended preflight method/headers", async () => {
    const response = await handleSubmission(new Request("http://localhost/api/registrations", {
      method: "OPTIONS", headers: { origin: config.SITE_ORIGINS[0], "access-control-request-method": "POST", "access-control-request-headers": "content-type, Idempotency-Key" }
    }), "registration", dependencies);
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(config.SITE_ORIGINS[0]);
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(response.headers.get("vary")).toBe("Origin");
    expect(response.headers.get("cache-control")).toBe("no-store");
    for (const origin of ["null", "http://localhost:3001.evil.example", "https://other.example.com"]) {
      const denied = await handleSubmission(request("{}", { origin }), "registration", dependencies);
      expect(denied.status).toBe(403);
      expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    }
    const badPreflight = await handleSubmission(new Request("http://localhost/api/registrations", {
      method: "OPTIONS", headers: { origin: config.SITE_ORIGINS[0], "access-control-request-method": "POST", "access-control-request-headers": "authorization" }
    }), "registration", dependencies);
    expect(badPreflight.status).toBe(403);
  });

  it("rejects malformed JSON, missing keys, unsupported content, and unknown fields safely", async () => {
    const checks = [
      [request("{"), 400, "invalid_json"],
      [request("{}", { "idempotency-key": "bad" }), 400, "invalid_idempotency_key"],
      [request("{}", { "content-type": "text/plain" }), 415, "unsupported_content_type"],
      [request(JSON.stringify({ email: "private@example.com", priceCentavos: 1 })), 400, "invalid_submission"]
    ] as const;
    for (const [input, status, code] of checks) {
      const response = await handleSubmission(input, "registration", dependencies);
      expect(response.status).toBe(status);
      const text = await response.text();
      expect(JSON.parse(text).error.code).toBe(code);
      expect(text).not.toContain("private@example.com");
      expect(response.headers.get("access-control-allow-origin")).toBe(config.SITE_ORIGINS[0]);
    }
  });

  it("limits actual streamed bytes even when Content-Length is absent or false", async () => {
    for (const headers of [{}, { "content-length": "1" }] as Record<string, string>[]) {
      const response = await handleSubmission(request(JSON.stringify({ context: "界".repeat(22000) }), headers), "corporate", dependencies);
      expect(response.status).toBe(413);
      expect(await response.json()).toEqual({ error: { code: "body_too_large" } });
    }
    expect((await handleSubmission(request("{}" + " ".repeat(65534)), "corporate", dependencies)).status).toBe(400);
    expect((await handleSubmission(request("{}" + " ".repeat(65535)), "corporate", dependencies)).status).toBe(413);
  });

  it("keeps intake closed by default and rejects invalid origin configuration", async () => {
    const response = await handleSubmission(request("{}"), "registration", { ...dependencies, config: { ...config, CRM_INTAKE_ENABLED: false } });
    expect(response.status).toBe(503);
    for (const [name, value] of Object.entries({ ...config, SITE_ORIGINS: config.SITE_ORIGINS.join(","), CORPORATE_INQUIRY_RECIPIENTS: config.CORPORATE_INQUIRY_RECIPIENTS.join(",") })) {
      vi.stubEnv(name, String(value));
    }
    vi.stubEnv("CRM_INTAKE_ENABLED", undefined);
    expect(getCrmEnv().CRM_INTAKE_ENABLED).toBe(false);
    for (const origin of ["https://example.com/path", "https://example.com/", "ftp://example.com", ""]) {
      vi.stubEnv("SITE_ORIGINS", origin);
      expect(() => getCrmEnv()).toThrow();
    }
    vi.stubEnv("SITE_ORIGINS", config.SITE_ORIGINS[0]);
    vi.stubEnv("RESEND_API_KEY", undefined);
    const unavailable = await handleSubmission(request("{}"), "registration");
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("access-control-allow-origin")).toBe(config.SITE_ORIGINS[0]);
    vi.unstubAllEnvs();
  });
});
