import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { readJson } from "./http";

const request = (body: string, headers: Record<string, string> = {}) => new Request("https://portal.example/api/corporate-inquiries", {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body
});

describe("Corporate request parsing", () => {
  it("reads JSON and rejects malformed input without exposing submitted answers", async () => {
    expect(await readJson(request('{"company":"Example Co"}'))).toEqual({ company: "Example Co" });
    await expect(readJson(request('{"private":"unfinished'))).rejects.toMatchObject({ status: 400, code: "invalid_json" });
    await expect(readJson(request("{}", { "content-type": "text/plain" }))).rejects.toMatchObject({ status: 415 });
  });

  it("limits actual UTF-8 bytes even when content length is missing or false", async () => {
    for (const headers of [{}, { "content-length": "1" }] as Record<string, string>[]) {
      await expect(readJson(request(JSON.stringify({ context: "界".repeat(22000) }), headers))).rejects.toMatchObject({ status: 413 });
    }
    expect(await readJson(request("{}" + " ".repeat(65534)))).toEqual({});
    await expect(readJson(request("{}" + " ".repeat(65535)))).rejects.toMatchObject({ status: 413 });
  });
});
