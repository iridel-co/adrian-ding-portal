import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: vi.fn(() => "database") }));
vi.mock("./config", () => ({ getIntakeOrigins: vi.fn(() => ["https://website.test"]),
  getRegistrationConfig: vi.fn(() => ({ TURNSTILE_SECRET_KEY: "secret" })) }));
vi.mock("./email", () => ({ sendEmailJob: vi.fn() }));
vi.mock("./turnstile", () => ({ verifyTurnstile: vi.fn() }));
vi.mock("./registration-service", () => ({ acceptRegistration: vi.fn() }));
import { sendEmailJob } from "./email";
import { getDb } from "@/db";
import { z } from "zod";
import { getRegistrationConfig } from "./config";
import { verifyTurnstile } from "./turnstile";
import { acceptRegistration } from "./registration-service";
import { IntakeError, IntakeErrorCode } from "./errors";
import { handleRegistration } from "./registration-intake";

const answers = { fullName: "Test Registrant", email: " TEST@example.invalid ", phone: "+639171234567", consent: true,
  workshopSessionId: "12345678-abcd-4000-8000-123456789abc", occupation: "Trainer", salaryRange: "Prefer not to say",
  turnstileToken: "fresh-token", website: "" };
const key = "12345678-abcd-4000-8000-123456789abd";
const request = (body: unknown = answers, origin = "https://website.test") => new Request("https://portal.test/api/registrations", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body)
});

describe("Workshop public intake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.mocked(getRegistrationConfig).mockReturnValue({ TURNSTILE_SECRET_KEY: "secret", REGISTRATION_EMAIL_ENABLED: true,
      REGISTRATION_PAYMENT_ACCOUNT_ID: key, RESEND_API_KEY: "synthetic-key", EMAIL_FROM: "team@company.test",
      EMAIL_REPLY_TO: "registrations@company.test", REGISTRATION_EMAIL_FROM: "team@company.test", REGISTRATION_REPLY_TO: "registrations@company.test" });
    vi.mocked(sendEmailJob).mockResolvedValue(undefined);
    vi.mocked(verifyTurnstile).mockResolvedValue(undefined);
    vi.mocked(acceptRegistration).mockResolvedValue({ response: { accepted: true, reference: "AD-PSW-0001", isPaid: false }, jobs: ["e1-job"] });
  });
  it("verifies before database access and returns the committed result with CORS and no caching", async () => {
    vi.mocked(verifyTurnstile).mockImplementation(async () => { expect(getDb).not.toHaveBeenCalled(); });
    const response = await handleRegistration(request());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true, reference: "AD-PSW-0001", isPaid: false });
    expect(response.headers.get("access-control-allow-origin")).toBe("https://website.test");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(verifyTurnstile).toHaveBeenCalledWith("fresh-token", "secret", ["https://website.test"], "workshop-registration");
    expect(acceptRegistration).toHaveBeenCalledWith("database", expect.objectContaining({ email: "test@example.invalid", city: null }), key, getRegistrationConfig());
    const data = vi.mocked(acceptRegistration).mock.calls[0][1];
    expect(data).not.toHaveProperty("turnstileToken");
    expect(data).not.toHaveProperty("website");
  });
  it("commits before sending and keeps provider failures out of the acceptance response", async () => {
    let committed = false;
    vi.mocked(acceptRegistration).mockImplementation(async () => {
      committed = true;
      return { response: { accepted: true, reference: "AD-PSW-0001", isPaid: false }, jobs: ["e1-job"] };
    });
    vi.mocked(sendEmailJob).mockImplementation(async () => {
      expect(committed).toBe(true);
      throw new Error("private provider failure");
    });
    const response = await handleRegistration(request());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true, reference: "AD-PSW-0001", isPaid: false });
    expect(sendEmailJob).toHaveBeenCalledWith("database", "e1-job", "synthetic-key");
  });
  it("leaves the saved job pending when workshop email sending is disabled", async () => {
    vi.mocked(getRegistrationConfig).mockReturnValue({ ...getRegistrationConfig(), REGISTRATION_EMAIL_ENABLED: false });
    expect((await handleRegistration(request())).status).toBe(202);
    expect(acceptRegistration).toHaveBeenCalledOnce();
    expect(sendEmailJob).not.toHaveBeenCalled();
  });
  it.each([
    { ...answers, consent: false }, { ...answers, website: "spam" }, { ...answers, turnstileToken: "" },
    { ...answers, workshopSessionId: "bad" }, { ...answers, email: "bad" }, { ...answers, phone: "123" },
    { ...answers, occupation: "" }, { ...answers, salaryRange: "" }, { ...answers, priceCentavos: 1 },
    { ...answers, reference: "AD-TEST-9999" }, { ...answers, isPaid: true }, { ...answers, isPaid: false }, { ...answers, paymentStatus: "paid" }, { ...answers, proof: "file" }
  ])("rejects invalid answers and server-controlled fields before verification or persistence", async body => {
    expect((await handleRegistration(request(body))).status).toBe(400);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });
  it("requires a fresh bot check on a duplicate retry and preserves generic acceptance", async () => {
    vi.mocked(acceptRegistration).mockResolvedValue({ response: { accepted: true }, jobs: [] });
    const response = await handleRegistration(request({ ...answers, turnstileToken: "retry-token" }));
    expect(await response.json()).toEqual({ accepted: true });
    expect(sendEmailJob).not.toHaveBeenCalled();
    expect(verifyTurnstile).toHaveBeenCalledWith("retry-token", "secret", expect.any(Array), "workshop-registration");
  });
  it("rejects bot failures before opening the database", async () => {
    vi.mocked(verifyTurnstile).mockRejectedValue(new IntakeError(400, IntakeErrorCode.VerificationFailed));
    expect((await handleRegistration(request())).status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });
  it.each([IntakeErrorCode.SoldOut, IntakeErrorCode.SessionUnavailable, IntakeErrorCode.IdempotencyKeyMismatch])(
    "preserves useful conflicts: %s", async code => {
      vi.mocked(acceptRegistration).mockRejectedValue(new IntakeError(409, code));
      const response = await handleRegistration(request());
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: code });
    });
  it("hides unexpected persistence errors", async () => {
    vi.mocked(acceptRegistration).mockRejectedValue(new Error("private database details"));
    const response = await handleRegistration(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "intake_unavailable" });
  });
  it("logs configuration failures before database access", async () => {
    vi.mocked(getRegistrationConfig).mockImplementation(() => { throw new IntakeError(503, IntakeErrorCode.IntakeUnavailable); });
    const response = await handleRegistration(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "intake_unavailable" });
    expect(getDb).not.toHaveBeenCalled();
    expect(JSON.parse(vi.mocked(console.error).mock.calls[0][0])).toEqual({
      event: "crm_intake_failed", form: "registration", stage: "config", status: 503, code: "intake_unavailable", unexpected: false
    });
  });

  it("logs unexpected save failures without exception details or submitted answers", async () => {
    vi.mocked(acceptRegistration).mockRejectedValue(new Error("private-database-password"));
    expect((await handleRegistration(request())).status).toBe(503);
    expect(JSON.parse(vi.mocked(console.error).mock.calls[0][0])).toMatchObject({
      event: "crm_intake_failed", form: "registration", stage: "save", unexpected: true
    });
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    for (const value of [answers.email, answers.fullName, answers.turnstileToken, "private-database-password"]) {
      expect(logs).not.toContain(value);
    }
  });

  it("logs shared environment field names when database initialization fails", async () => {
    const invalid = z.object({ DATABASE_URL: z.url() }).safeParse({ DATABASE_URL: "private-connection-string" });
    if (invalid.success) throw new Error("fixture must be invalid");
    vi.mocked(getDb).mockImplementationOnce(() => { throw invalid.error; });
    expect((await handleRegistration(request())).status).toBe(503);
    expect(JSON.parse(vi.mocked(console.error).mock.calls[0][0])).toMatchObject({
      stage: "database", fields: ["DATABASE_URL"], unexpected: true
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-connection-string");
  });

  it("logs acceptance without including submitted answers", async () => {
    expect((await handleRegistration(request())).status).toBe(202);
    expect(JSON.parse(vi.mocked(console.info).mock.calls[0][0])).toEqual({
      event: "crm_intake_accepted", form: "registration", status: 202
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("accepts without a token only when verification is explicitly disabled", async () => {
    vi.mocked(getRegistrationConfig).mockReturnValue({ ...getRegistrationConfig(), TURNSTILE_SECRET_KEY: "" });
    const body = { ...answers, turnstileToken: "" };
    expect((await handleRegistration(request(body))).status).toBe(202);
    expect(verifyTurnstile).not.toHaveBeenCalled();
    expect(acceptRegistration).toHaveBeenCalledOnce();
    vi.clearAllMocks();
    expect((await handleRegistration(request({ ...body, consent: false }))).status).toBe(400);
    expect((await handleRegistration(request({ ...body, website: "spam" }))).status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("handles preflight without intake configuration or database access", async () => {
    const response = await handleRegistration(new Request("https://portal.test/api/registrations", { method: "OPTIONS",
      headers: { Origin: "https://website.test", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Idempotency-Key" } }));
    expect(response.status).toBe(204);
    expect(getRegistrationConfig).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });
  it("rejects unapproved origins and missing keys", async () => {
    const response = await handleRegistration(request(answers, "https://attacker.test"));
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    const req = request(); req.headers.delete("idempotency-key");
    expect((await handleRegistration(req)).status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });
});

afterEach(() => vi.restoreAllMocks());
