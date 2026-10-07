import { expect, it, vi } from "vitest";
import type { Db } from "@/db";
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: () => { throw new Error("No database access in boundary tests"); } }));
import { handleSessionLookup } from "./session-lookup";

const origin = "http://localhost:3001";
const config = { db: {} as Db, origins: [origin] };
it("permits approved GET preflight and blocks other origins, headers, and methods", async () => {
  const preflight = (headers: Record<string, string>) => handleSessionLookup(new Request("http://localhost/api/workshop-sessions", { method: "OPTIONS", headers }), config);
  const allowed = await preflight({ origin, "access-control-request-method": "GET" });
  expect(allowed.status).toBe(204); expect(allowed.headers.get("access-control-allow-origin")).toBe(origin);
  expect(allowed.headers.get("access-control-allow-methods")).toBe("GET");
  expect((await preflight({ origin: "https://attacker.example", "access-control-request-method": "GET" })).status).toBe(403);
  expect((await preflight({ origin, "access-control-request-method": "POST" })).status).toBe(403);
  expect((await preflight({ origin, "access-control-request-method": "GET", "access-control-request-headers": "Authorization" })).status).toBe(403);
});
it("rejects invalid or unbounded query input and safely handles unavailable dependencies", async () => {
  for (const query of ["", "workshopSlug=", "workshopSlug=test&limit=101", "workshopSlug=test&offset=-1", "workshopSlug=test&email=private@example.com"]) {
    const response = await handleSessionLookup(new Request(`http://localhost/api/workshop-sessions?${query}`, { headers: { origin } }), config);
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: { code: "invalid_request" } });
    expect(response.headers.get("access-control-allow-origin")).toBe(origin);
  }
  const unavailable = await handleSessionLookup(new Request("http://localhost/api/workshop-sessions?workshopSlug=test"), config);
  expect(unavailable.status).toBe(503); expect(await unavailable.json()).toEqual({ error: { code: "lookup_unavailable" } });
});
