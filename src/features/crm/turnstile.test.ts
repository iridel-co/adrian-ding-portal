import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { verifyCorporateTurnstile } from "./turnstile";
afterEach(() => vi.unstubAllGlobals());

describe("Corporate Turnstile verification", () => {
  it("checks the token server-side using the corporate action and approved hostname", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ success: true, hostname: "website.test", action: "corporate-inquiry" }));
    vi.stubGlobal("fetch", fetch);
    await verifyCorporateTurnstile("token", "private-secret", ["https://website.test"]);
    expect(fetch.mock.calls[0][0]).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ secret: "private-secret", response: "token" });
  });
  it.each([
    { success: false, "error-codes": ["timeout-or-duplicate"] },
    { success: true, hostname: "attacker.test", action: "corporate-inquiry" },
    { success: true, hostname: "website.test", action: "registration" }
  ])("rejects invalid tokens, hostnames or actions", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await expect(verifyCorporateTurnstile("token", "secret", ["https://website.test"]))
      .rejects.toMatchObject({ status: 400, code: "verification_failed" });
  });
  it.each([{ success: false, "error-codes": ["invalid-input-secret"] }, { bad: "response" }])("hides configuration and provider failures", async body => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    await expect(verifyCorporateTurnstile("token", "secret", ["https://website.test"]))
      .rejects.toMatchObject({ status: 503, code: "verification_unavailable" });
  });
  it("fails safely on network errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private details")));
    await expect(verifyCorporateTurnstile("token", "secret", ["https://website.test"]))
      .rejects.toMatchObject({ code: "verification_unavailable" });
  });
});
