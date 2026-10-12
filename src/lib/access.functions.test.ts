import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Execute the application's registered middleware/handlers without a running HTTP server.
const harness = vi.hoisted(() => ({
  request: null as Request | null,
  sessionUser: null as null | { id: string },
  identity: null as null | { id: string; name: string; email: string; emailVerified: boolean },
  crmCall: vi.fn(), dbCall: vi.fn(), responseStatus: vi.fn()
}));
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => harness.request!, setResponseHeader: vi.fn(), setResponseStatus: harness.responseStatus }));
vi.mock("@tanstack/react-start", () => {
  type Context = Record<string, unknown>;
  type Middleware = { execute(context: Context, next: (context: Context) => unknown): Promise<unknown> };
  const run = async (middlewares: Middleware[], context: Context, handler: (context: Context) => unknown): Promise<unknown> => {
    const [first, ...rest] = middlewares;
    return first ? first.execute(context, context => run(rest, context, handler)) : handler(context);
  };
  return {
    createMiddleware: () => {
      let parents: Middleware[] = [];
      const builder = {
        middleware(list: Middleware[]) { parents = list; return builder; },
        server(handler: (input: { context: Context; next(input: { context: Context }): unknown }) => unknown) {
          return { execute: (context: Context, next: (context: Context) => unknown) => run(parents, context,
            context => handler({ context, next: input => next({ ...context, ...input.context }) })) };
        }
      };
      return builder;
    },
    createServerFn: () => {
      let middlewares: Middleware[] = [];
      let validator: { parse(input: unknown): unknown } | undefined;
      const builder = {
        middleware(list: Middleware[]) { middlewares = list; return builder; },
        validator(schema: typeof validator) { validator = schema; return builder; },
        handler(handler: (input: { context: Context; data: unknown }) => unknown) {
          return (input?: { data?: unknown }) => run(middlewares, {}, context =>
            handler({ context, data: validator ? validator.parse(input?.data) : input?.data }));
        }
      };
      return builder;
    }
  };
});
vi.mock("./auth.functions", () => ({ authMiddleware: {
  async execute(context: object, next: (context: object) => unknown) {
    if (!harness.sessionUser) throw new Error("Unauthorized");
    return next({ ...context, user: harness.sessionUser });
  }
} }));
vi.mock("@/db", () => ({ getDb: () => ({
  select() {
    harness.dbCall();
    const chain = { from: () => chain, innerJoin: () => chain, where: () => chain,
      limit: async () => harness.identity ? [harness.identity] : [] };
    return chain;
  }
}) }));
vi.mock("@/features/crm/staff", () => ({ changeInquiry: harness.crmCall, inquiryDetail: harness.crmCall,
  listInquiries: harness.crmCall, retryInquiryEmail: harness.crmCall }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ BETTER_AUTH_URL: "https://portal.test" }) }));
import { $changeInquiry, $listInquiries } from "@/features/crm/functions";

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.clearAllMocks();
  harness.request = new Request("https://portal.test/_server/action");
  vi.stubEnv("ADMIN_EMAILS", "admin@company.test");
  vi.stubEnv("STAFF_EMAILS", "staff@company.test");
  harness.sessionUser = { id: "current-user" };
  harness.identity = { id: "current-user", name: "Staff", email: "staff@company.test", emailVerified: true };
  harness.crmCall.mockResolvedValue([]);
});

describe("Registered CRM permissions", () => {
  it("allows Staff and Admin inquiry access", async () => {
    await $listInquiries({ data: {} });
    expect(harness.crmCall).toHaveBeenCalledOnce();
    harness.identity!.email = "admin@company.test";
    await $listInquiries({ data: {} });
    expect(harness.crmCall).toHaveBeenCalledTimes(2);
  });
  it("blocks unassigned and unverified sessions before listing inquiries", async () => {
    harness.identity!.email = "legacy@company.test";
    await expect($listInquiries({ data: {} })).rejects.toThrow("staff_access_required");
    harness.identity!.email = "staff@company.test";
    harness.identity!.emailVerified = false;
    await expect($listInquiries({ data: {} })).rejects.toThrow("staff_access_required");
    expect(harness.crmCall).not.toHaveBeenCalled();
  });
  it("blocks unauthenticated requests before any identity or business query", async () => {
    harness.sessionUser = null;
    await expect($listInquiries({ data: {} })).rejects.toThrow("Unauthorized");
    expect(harness.dbCall).not.toHaveBeenCalled();
    expect(harness.crmCall).not.toHaveBeenCalled();
  });
  it("rejects cross-site CRM calls without querying identity or inquiry data", async () => {
    harness.request = new Request("https://portal.test/_server/action", { headers: { Origin: "https://attacker.test", "Sec-Fetch-Site": "cross-site" } });
    await expect($listInquiries({ data: {} })).rejects.toThrow("origin_not_allowed");
    expect(harness.dbCall).not.toHaveBeenCalled();
    expect(harness.crmCall).not.toHaveBeenCalled();
  });
  it("requires an approved origin on CRM mutations", async () => {
    harness.request = new Request("https://portal.test/_server/action", { method: "POST" });
    await expect($changeInquiry({ data: { id: "12345678-abcd-4000-8000-123456789abc", expectedStatus: "NEW", status: "CONTACTED" } })).rejects.toThrow("origin_not_allowed");
    harness.request = new Request("https://portal.test/_server/action", { method: "POST", headers: { Origin: "https://portal.test" } });
    await $changeInquiry({ data: { id: "12345678-abcd-4000-8000-123456789abc", expectedStatus: "NEW", status: "CONTACTED" } });
    expect(harness.crmCall).toHaveBeenCalledOnce();
  });
  it("hides unexpected business database failures", async () => {
    harness.crmCall.mockRejectedValue(new Error("private connection details"));
    await expect($listInquiries({ data: {} })).rejects.toThrow("crm_unavailable");
    expect(harness.responseStatus).toHaveBeenCalledWith(503);
  });
});
