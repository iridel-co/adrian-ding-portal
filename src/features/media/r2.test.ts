import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
const { sign } = vi.hoisted(() => ({ sign: vi.fn() }));
vi.mock("aws4fetch", () => ({ AwsClient: class { sign = sign; } }));
vi.mock("@/lib/env", () => ({ getR2Env: () => ({ R2_ACCOUNT_ID: "synthetic", R2_BUCKET: "test-bucket", R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test" }) }));
import { readPaymentQr } from "./r2";
const png = new Uint8Array([137,80,78,71,13,10,26,10]);
const qr = { key: "media/qr.png", contentType: "image/png", sizeBytes: png.length };
beforeEach(() => { sign.mockReset(); sign.mockImplementation(async (url, options) => new Request(url, options)); });
afterEach(() => vi.unstubAllGlobals());
it("snapshots the signed bucket object into a base64 attachment with bounded fetch", async () => {
  const fetch = vi.fn(async () => new Response(png, { headers: { "Content-Type": "image/png" } }));
  vi.stubGlobal("fetch", fetch);
  expect(await readPaymentQr(qr)).toEqual({ filename: "payment-qr.png", content: btoa(String.fromCharCode(...png)), contentType: "image/png" });
  expect(sign.mock.calls[0][0].href).toBe("https://synthetic.r2.cloudflarestorage.com/test-bucket/media/qr.png");
  expect(sign.mock.calls[0][1]).toMatchObject({ redirect: "error", signal: expect.any(AbortSignal) });
});
it.each([{ ...qr, sizeBytes: 0 }, { ...qr, sizeBytes: 1048577 }, { ...qr, contentType: "image/svg+xml" }])(
  "rejects invalid attachment metadata before fetching", async input => {
    await expect(readPaymentQr(input)).rejects.toThrow();
    expect(sign).not.toHaveBeenCalled();
  });
it("rejects errors, mismatched size/type and disguised non-image bodies", async () => {
  for (const makeResponse of [
    () => new Response(null, { status: 404 }),
    () => new Response(png, { headers: { "Content-Type": "text/html" } }),
    () => new Response(png.slice(0, 4), { headers: { "Content-Type": "image/png" } }),
    () => new Response("<html />", { headers: { "Content-Type": "image/png" } }),
    () => new Response(new Uint8Array(1048577), { headers: { "Content-Type": "image/png" } })
  ]) {
    vi.stubGlobal("fetch", vi.fn(async () => makeResponse()));
    await expect(readPaymentQr(qr)).rejects.toThrow();
  }
});
it.each([
  { type: "image/jpeg", extension: "jpg", bytes: [255,216,255] },
  { type: "image/webp", extension: "webp", bytes: [82,73,70,70,0,0,0,0,87,69,66,80] }
])("accepts the supported $type signature", async ({ type, extension, bytes }) => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array(bytes), { headers: { "Content-Type": type } })));
  expect((await readPaymentQr({ ...qr, contentType: type, sizeBytes: bytes.length })).filename).toBe(`payment-qr.${extension}`);
});
