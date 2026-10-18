import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Execute the application's registered middleware/handlers without a running HTTP server.
const harness = vi.hoisted(() => ({
  request: null as Request | null,
  sessionUser: null as null | { id: string },
  identity: null as null | { id: string; name: string; email: string; emailVerified: boolean },
  crmCall: vi.fn(), registrationCall: vi.fn(), dbCall: vi.fn(), responseStatus: vi.fn()
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
vi.mock("@/features/crm/registration-staff", () => ({ listRegistrationSessions: harness.registrationCall,
  registrationSessionDetail: harness.registrationCall, listRegistrations: harness.registrationCall,
  registrationDetail: harness.registrationCall, changeRegistration: harness.registrationCall, retryRegistrationEmail: harness.registrationCall }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ BETTER_AUTH_URL: "https://portal.test" }) }));
import { RegistrationAction } from "@/features/crm/registration-staff-schemas";
import { $changeInquiry, $crmAccess, $listInquiries, $listRegistrationSessions, $getRegistrationSession,
  $listRegistrations, $getRegistration, $changeRegistration, $retryRegistrationEmail } from "@/features/crm/functions";

afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.clearAllMocks();
  harness.request = new Request("https://portal.test/_server/action");
  vi.stubEnv("ADMIN_EMAILS", "admin@company.test");
  vi.stubEnv("STAFF_EMAILS", "staff@company.test");
  harness.sessionUser = { id: "current-user" };
  harness.identity = { id: "current-user", name: "Staff", email: "staff@company.test", emailVerified: true };
  harness.crmCall.mockResolvedValue([]);
  harness.registrationCall.mockResolvedValue([]);
  vi.stubEnv("REGISTRATION_EMAIL_ENABLED", "true");
  vi.stubEnv("REGISTRATION_PAYMENT_ACCOUNT_ID", "12345678-abcd-4000-8000-123456789abc");
  vi.stubEnv("REGISTRATION_EMAIL_FROM", "Team <registrations@company.test>");
  vi.stubEnv("REGISTRATION_REPLY_TO", "registrations@company.test");
  vi.stubEnv("RESEND_API_KEY", "synthetic-key");
});

describe("Registered CRM permissions", () => {
  it("returns only the current role for navigation and rejects removed assignments", async () => {
    await expect($crmAccess()).resolves.toEqual({ role: "staff" });
    harness.identity!.email = "admin@company.test";
    await expect($crmAccess()).resolves.toEqual({ role: "admin" });
    vi.stubEnv("ADMIN_EMAILS", "");
    await expect($crmAccess()).rejects.toThrow("staff_access_required");
    expect(harness.crmCall).not.toHaveBeenCalled();
  });
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
  it("allows an email link's GET page navigation while still checking the current role", async () => {
    harness.request = new Request("https://portal.test/inquiries/12345678-abcd-4000-8000-123456789abc", {
      headers: { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document" }
    });
    await expect($crmAccess()).resolves.toEqual({ role: "staff" });
    harness.identity!.email = "removed@company.test";
    await expect($crmAccess()).rejects.toThrow("staff_access_required");
    expect(harness.crmCall).not.toHaveBeenCalled();
  });
  it("allows the post-login document request even when its fetch mode is cors", async () => {
    harness.request = new Request("https://portal.test/", { headers: {
      "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "document"
    } });
    await expect($crmAccess()).resolves.toEqual({ role: "staff" });
    harness.identity!.email = "removed@company.test";
    await expect($crmAccess()).rejects.toThrow("staff_access_required");
  });
  it("does not treat document metadata as permission for foreign origins, RPC calls or mutations", async () => {
    const metadata = { "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "document" };
    for (const headers of [
      { ...metadata, Origin: "https://attacker.test" },
      { ...metadata, "x-tsr-serverFn": "true" },
      { ...metadata, "Sec-Fetch-Dest": "empty" }
    ]) {
      harness.request = new Request("https://portal.test/_server/action", { headers });
      await expect($crmAccess()).rejects.toThrow("origin_not_allowed");
    }
    harness.request = new Request("https://portal.test/_server/action", { method: "POST", headers: metadata });
    await expect($changeInquiry({ data: { id: "12345678-abcd-4000-8000-123456789abc", expectedStatus: "NEW", status: "CONTACTED" } })).rejects.toThrow("origin_not_allowed");
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

const registrationId = "12345678-abcd-4000-8000-123456789abc";
const markPaidInput = { id: registrationId, action: RegistrationAction.MarkPaid as const, expectedIsPaid: false as const,
  expectedUpdatedAt: "2026-10-18T02:00:00.000Z", paymentMethod: "bank" as const, paidAmountCentavos: 10000,
  payerName: "Synthetic Payer", providerTransactionReference: "transaction-1" };
const registrationRequests = [
  { name: "list sessions", method: "GET", call: () => $listRegistrationSessions({ data: {} }) },
  { name: "get session", method: "GET", call: () => $getRegistrationSession({ data: { id: registrationId } }) },
  { name: "list registrations", method: "GET", call: () => $listRegistrations({ data: { workshopSessionId: registrationId } }) },
  { name: "get registration", method: "GET", call: () => $getRegistration({ data: { id: registrationId } }) },
  { name: "change registration", method: "POST", call: () => $changeRegistration({ data: markPaidInput }) },
  { name: "retry registration email", method: "POST", call: () => $retryRegistrationEmail({ data: { registrationId, jobId: registrationId } }) }
];
describe("Registered workshop staff functions", () => {
  it.each(registrationRequests)("allows current Staff and Admin to $name", async request => {
    harness.request = new Request("https://portal.test/_server/action", { method: request.method, headers: { Origin: "https://portal.test" } });
    await request.call();
    harness.identity!.email = "admin@company.test";
    await request.call();
    expect(harness.registrationCall).toHaveBeenCalledTimes(2);
  });
  it.each(registrationRequests)("rechecks identity, current allowlists and origin before $name", async request => {
    const approved = () => new Request("https://portal.test/_server/action", { method: request.method, headers: { Origin: "https://portal.test" } });
    harness.request = approved();
    harness.identity!.emailVerified = false;
    await expect(request.call()).rejects.toThrow("staff_access_required");
    harness.identity!.emailVerified = true;
    vi.stubEnv("STAFF_EMAILS", "");
    await expect(request.call()).rejects.toThrow("staff_access_required");
    vi.stubEnv("STAFF_EMAILS", "staff@company.test");
    harness.identity = null;
    await expect(request.call()).rejects.toThrow("staff_access_required");
    harness.sessionUser = null;
    await expect(request.call()).rejects.toThrow("Unauthorized");
    harness.sessionUser = { id: "current-user" };
    harness.request = new Request("https://portal.test/_server/action", { method: request.method,
      headers: { Origin: "https://attacker.test", "Sec-Fetch-Site": "cross-site" } });
    await expect(request.call()).rejects.toThrow("origin_not_allowed");
    expect(harness.registrationCall).not.toHaveBeenCalled();
  });
  it("requires an origin on workshop mutations and passes only the verified actor", async () => {
    harness.request = new Request("https://portal.test/_server/action", { method: "POST" });
    await expect($changeRegistration({ data: markPaidInput })).rejects.toThrow("origin_not_allowed");
    harness.request = new Request("https://portal.test/_server/action", { method: "POST", headers: { Origin: "https://portal.test" } });
    await $changeRegistration({ data: markPaidInput });
    expect(harness.registrationCall.mock.calls[0][1]).toEqual({ id: "current-user", name: "Staff", email: "staff@company.test", role: "staff" });
  });
  it("does not retry workshop mail while sending is disabled", async () => {
    vi.stubEnv("REGISTRATION_EMAIL_ENABLED", "false");
    harness.request = new Request("https://portal.test/_server/action", { method: "POST", headers: { Origin: "https://portal.test" } });
    await expect($retryRegistrationEmail({ data: { registrationId, jobId: registrationId } })).rejects.toThrow("email_unavailable");
    expect(harness.registrationCall).not.toHaveBeenCalled();
    expect(harness.responseStatus).toHaveBeenCalledWith(503);
  });
  it("hides unexpected registration service errors", async () => {
    harness.registrationCall.mockRejectedValue(new Error("private connection details"));
    await expect($listRegistrationSessions({ data: {} })).rejects.toThrow("crm_unavailable");
    expect(harness.responseStatus).toHaveBeenCalledWith(503);
  });
});
