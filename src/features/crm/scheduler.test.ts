import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getDb: vi.fn(), getCorporateMailConfig: vi.fn() }));
vi.mock("@/db", () => ({ getDb: mocks.getDb }));
vi.mock("./config", () => ({ getCorporateMailConfig: mocks.getCorporateMailConfig }));
import { handleCorporateScheduler } from "./scheduler";

const secret = "synthetic-scheduler-secret-at-least-32-characters";
const request = (token = `Bearer ${secret}`, method = "POST") => new Request("https://portal.test/api/internal/corporate-scheduler", {
  method, headers: { Authorization: token }
});
beforeEach(() => {
  vi.stubEnv("CORPORATE_SCHEDULER_SECRET", secret);
  vi.stubEnv("CORPORATE_SCHEDULER_ENABLED", "true");
  mocks.getDb.mockReset(); mocks.getCorporateMailConfig.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("Corporate scheduler boundary", () => {
  it.each(["", "wrong", `Bearer ${secret}x`, `Bearer ${secret.slice(0, -1)}`, "x".repeat(1025)])("rejects an invalid secret without accessing the database", async token => {
    const response = await handleCorporateScheduler(request(token));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "scheduler_unauthorized" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("requires POST and fails closed when disabled or unconfigured", async () => {
    expect((await handleCorporateScheduler(request(undefined, "GET"))).status).toBe(405);
    vi.stubEnv("CORPORATE_SCHEDULER_ENABLED", "false");
    expect((await handleCorporateScheduler(request())).status).toBe(503);
    vi.stubEnv("CORPORATE_SCHEDULER_SECRET", "short");
    expect((await handleCorporateScheduler(request())).status).toBe(503);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });
  it("permits a secret-authenticated scheduler without browser cookies or Origin", async () => {
    const where = vi.fn(() => ({ orderBy: () => ({ limit: () => ({ for: async () => [] }) }) }));
    const db = { transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      execute: vi.fn(), select: () => ({ from: () => ({ where }) })
    }) };
    mocks.getDb.mockReturnValue(db);
    mocks.getCorporateMailConfig.mockReturnValue({ CORPORATE_EMAIL_ENABLED: false });
    const response = await handleCorporateScheduler(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ queued: 0, processed: 0, errors: 0, sendingEnabled: false });
  });
  it("returns a generic error rather than database details", async () => {
    mocks.getDb.mockImplementation(() => { throw new Error("private database error"); });
    const response = await handleCorporateScheduler(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private");
  });
});
