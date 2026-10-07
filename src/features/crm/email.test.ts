import { afterEach, describe, expect, it, vi } from "vitest";

const { r2Fetch, r2Sign } = vi.hoisted(() => ({ r2Fetch: vi.fn(), r2Sign: vi.fn(async (input: URL, init: RequestInit) => new Request(input, init)) }));
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("aws4fetch", () => ({ AwsClient: class { sign = r2Sign; } }));
vi.mock("@/lib/env", () => ({ getR2Env: () => ({ R2_ACCOUNT_ID: "synthetic", R2_ACCESS_KEY_ID: "synthetic", R2_SECRET_ACCESS_KEY: "synthetic", R2_BUCKET: "synthetic", R2_PUBLIC_BASE_URL: "https://qr.example.com" }) }));
import { readPaymentQr } from "@/features/media/r2";
import { sendViaResend } from "./email";

afterEach(() => { vi.unstubAllGlobals(); r2Fetch.mockReset(); r2Sign.mockClear(); });
const payload = { from: "crm@example.com", to: ["recipient@example.com"], subject: "Synthetic", html: "<p>Test</p>", text: "Test", replyTo: "team@example.com", attachments: [{ filename: "qr.png", content: "base64", contentType: "image/png" }] };

describe("CRM mail provider and QR snapshot", () => {
  it("maps the immutable payload to Resend's HTTP fields and includes its job key", async () => {
    const fetch = vi.fn(async () => Response.json({ id: "provider-id" })); vi.stubGlobal("fetch", fetch);
    expect(await sendViaResend(payload, "job-key", "synthetic-key")).toEqual({ id: "provider-id" });
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options.headers).toMatchObject({ "Authorization": "Bearer synthetic-key", "Idempotency-Key": "job-key" });
    expect(options.signal).toBeInstanceOf(AbortSignal); expect(options.redirect).toBe("error");
    expect(JSON.parse(options.body as string)).toEqual({ from: payload.from, to: payload.to, subject: payload.subject, html: payload.html, text: payload.text, reply_to: payload.replyTo, attachments: [{ filename: "qr.png", content: "base64" }] });
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
  it("reads only the configured R2 object and stores its bytes as base64", async () => {
    vi.stubGlobal("fetch", r2Fetch);
    const bytes = new Uint8Array([137,80,78,71,13,10,26,10]);
    r2Fetch.mockResolvedValue(new Response(bytes, { headers: { "content-type": "image/png" } }));
    expect(await readPaymentQr({ key: "qr/synthetic.png", contentType: "image/png", sizeBytes: bytes.length })).toEqual({ filename: "payment-qr.png", content: "iVBORw0KGgo=", contentType: "image/png" });
    expect(r2Fetch.mock.calls[0][0].url).toBe("https://synthetic.r2.cloudflarestorage.com/synthetic/qr/synthetic.png");
    expect(r2Fetch.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
  });
  it("rejects unavailable, oversized, mismatched or wrongly labelled QR content", async () => {
    vi.stubGlobal("fetch", r2Fetch);
    const qr = { key: "qr/synthetic.png", contentType: "image/png", sizeBytes: 8 };
    await expect(readPaymentQr({ ...qr, sizeBytes: 1048577 })).rejects.toThrow(/limit/);
    expect(r2Fetch).not.toHaveBeenCalled();
    for (const response of [new Response("missing", { status: 404 }), new Response("not an image", { headers: { "content-type": "text/html" } }), new Response("htmlhtml", { headers: { "content-type": "image/png" } }), new Response("short", { headers: { "content-type": "image/png" } })]) {
      r2Fetch.mockResolvedValueOnce(response);
      await expect(readPaymentQr(qr)).rejects.toThrow(/QR/);
    }
    r2Fetch.mockResolvedValueOnce(new Response(new Uint8Array(1048577), { headers: { "content-type": "image/png" } }));
    await expect(readPaymentQr(qr)).rejects.toThrow(/limit/);
  });
});
