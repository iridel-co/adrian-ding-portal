import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { sendViaResend } from "./email";
afterEach(() => vi.unstubAllGlobals());
const payload = { from: "crm@example.com", to: ["recipient@example.com"], subject: "Synthetic", html: "<p>Test</p>", text: "Test", replyTo: "team@example.com" };

describe("Corporate inquiry mail provider", () => {
  it("preserves the shared CRM attachment contract", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "provider-id" })); vi.stubGlobal("fetch", fetch);
    await sendViaResend({ ...payload, attachments: [{ filename: "proof.png", content: "base64", contentType: "image/png" }] }, "job-key", "synthetic-key");
    const [, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(options.body as string).attachments).toEqual([{ filename: "proof.png", content: "base64" }]);
  });
  it("maps the immutable payload to Resend's HTTP fields and includes its job key", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "provider-id" })); vi.stubGlobal("fetch", fetch);
    expect(await sendViaResend(payload, "job-key", "synthetic-key")).toEqual({ id: "provider-id" });
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers).toMatchObject({ "Authorization": "Bearer synthetic-key", "Idempotency-Key": "job-key" });
    expect(options.signal).toBeInstanceOf(AbortSignal); expect(options.redirect).toBe("error");
    expect(JSON.parse(options.body as string)).toEqual({ from: payload.from, to: payload.to, subject: payload.subject, html: payload.html, text: payload.text, reply_to: payload.replyTo });
  });
  it("rejects provider errors and malformed acknowledgments without returning their contents", async () => {
    for (const status of [401, 409, 429, 503]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("private provider detail", { status })));
      await expect(sendViaResend(payload, "job-key", "synthetic-key")).rejects.toThrow(/^provider_/);
    }
    for (const body of [{}, { id: 123 }, { id: "" }]) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
      await expect(sendViaResend(payload, "job-key", "synthetic-key")).rejects.toThrow("provider_response_invalid");
    }
  });
});
