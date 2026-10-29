import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/db", () => ({ getDb: vi.fn(() => "database") }));
vi.mock("./config", () => ({ getCorporateOrigins: vi.fn(() => ["https://website.test"]), getCorporateConfig: vi.fn() }));
vi.mock("./turnstile", () => ({ verifyCorporateTurnstile: vi.fn() }));
vi.mock("./service", () => ({ acceptCorporateInquiry: vi.fn() }));
vi.mock("./email", () => ({ sendEmailJob: vi.fn() }));
import { getDb } from "@/db";
import { getCorporateConfig } from "./config";
import { verifyCorporateTurnstile } from "./turnstile";
import { acceptCorporateInquiry } from "./service";
import { sendEmailJob } from "./email";
import { IntakeError, IntakeErrorCode } from "./errors";
import { handleCorporateInquiry } from "./intake";

const answers = { fullName: "Test Lead", email: "test@example.invalid", phone: "+639171234567", consent: true,
  company: "Test Company", role: "HR Manager", program: "Leadership", attendees: "16 to 30",
  targetDateFrom: "2027-01-12", venue: "Our office", turnstileToken: "fresh-token", website: "" };
const key = "12345678-abcd-4000-8000-123456789abc";
const request = (body: unknown = answers, origin = "https://website.test") => new Request("https://portal.test/api/corporate-inquiries", {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body)
});

describe("Corporate public intake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCorporateConfig).mockReturnValue({ TURNSTILE_SECRET_KEY: "secret", CORPORATE_EMAIL_ENABLED: true,
      RESEND_API_KEY: "provider-key", CORPORATE_EMAIL_FROM: "team@company.test", CORPORATE_REPLY_TO: "sales@company.test",
      EMAIL_FROM: "team@company.test", EMAIL_REPLY_TO: "sales@company.test", CORPORATE_INQUIRY_RECIPIENTS: ["a@company.test", "b@company.test"],
      CORPORATE_TEAM_PHONE: "1234567", CORPORATE_CREDIBILITY_LINE: "Approved line", CORPORATE_PORTAL_URL: "https://portal.test" });
    vi.mocked(verifyCorporateTurnstile).mockResolvedValue(undefined);
    vi.mocked(acceptCorporateInquiry).mockResolvedValue(["e3", "n3"]);
    vi.mocked(sendEmailJob).mockResolvedValue(undefined);
  });

  it("verifies, commits, then delivers and returns generic acceptance with CORS", async () => {
    const order: string[] = [];
    vi.mocked(verifyCorporateTurnstile).mockImplementation(async () => { order.push("verify"); });
    vi.mocked(acceptCorporateInquiry).mockImplementation(async (_db, input) => {
      order.push("commit");
      expect(input).not.toHaveProperty("turnstileToken");
      expect(input).not.toHaveProperty("website");
      return ["e3", "n3"];
    });
    vi.mocked(sendEmailJob).mockImplementation(async (_db, id) => { order.push(id); });
    const response = await handleCorporateInquiry(request());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    expect(response.headers.get("access-control-allow-origin")).toBe("https://website.test");
    expect(order).toEqual(["verify", "commit", "e3", "n3"]);
  });

  it.each([
    { ...answers, consent: false }, { ...answers, website: "spam" }, { ...answers, turnstileToken: "" },
    { ...answers, targetDateTo: "2027-01-11" }, { ...answers, targetDateText: "Not fixed" },
    { ...answers, extra: "unrecognized" }
  ])("rejects invalid or honeypot-filled submissions before verification or database access", async body => {
    expect((await handleCorporateInquiry(request(body))).status).toBe(400);
    expect(verifyCorporateTurnstile).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects a failed bot check before saving", async () => {
    vi.mocked(verifyCorporateTurnstile).mockRejectedValue(new IntakeError(400, IntakeErrorCode.VerificationFailed));
    expect((await handleCorporateInquiry(request())).status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("verifies a refreshed retry but creates and sends no new email jobs", async () => {
    vi.mocked(acceptCorporateInquiry).mockResolvedValue([]);
    expect((await handleCorporateInquiry(request({ ...answers, turnstileToken: "refreshed-token" }))).status).toBe(202);
    expect(verifyCorporateTurnstile).toHaveBeenCalledWith("refreshed-token", "secret", ["https://website.test"]);
    expect(sendEmailJob).not.toHaveBeenCalled();
  });

  it("accepts a committed inquiry despite email failure", async () => {
    vi.mocked(sendEmailJob).mockRejectedValue(new Error("private provider details"));
    expect((await handleCorporateInquiry(request())).status).toBe(202);
    expect(sendEmailJob).toHaveBeenCalledTimes(2);
  });

  it("keeps pending jobs when sending is disabled", async () => {
    vi.mocked(getCorporateConfig).mockReturnValue({ ...getCorporateConfig(), CORPORATE_EMAIL_ENABLED: false });
    expect((await handleCorporateInquiry(request())).status).toBe(202);
    expect(acceptCorporateInquiry).toHaveBeenCalledOnce();
    expect(sendEmailJob).not.toHaveBeenCalled();
  });

  it("returns mismatch conflicts and hides unexpected database errors", async () => {
    vi.mocked(acceptCorporateInquiry).mockRejectedValue(new IntakeError(409, IntakeErrorCode.IdempotencyKeyMismatch));
    expect((await handleCorporateInquiry(request())).status).toBe(409);
    vi.mocked(acceptCorporateInquiry).mockRejectedValue(new Error("private database connection"));
    const response = await handleCorporateInquiry(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "intake_unavailable" });
    expect(sendEmailJob).not.toHaveBeenCalled();
  });

  it("accepts without a token only when verification is explicitly disabled", async () => {
    vi.mocked(getCorporateConfig).mockReturnValue({ ...getCorporateConfig(), TURNSTILE_SECRET_KEY: "" });
    const body = { ...answers, turnstileToken: "" };
    expect((await handleCorporateInquiry(request(body))).status).toBe(202);
    expect(verifyCorporateTurnstile).not.toHaveBeenCalled();
    expect(acceptCorporateInquiry).toHaveBeenCalledOnce();
    vi.clearAllMocks();
    expect((await handleCorporateInquiry(request({ ...body, consent: false }))).status).toBe(400);
    expect((await handleCorporateInquiry(request({ ...body, website: "spam" }))).status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("allows the expected preflight without bot, mail or database configuration", async () => {
    const response = await handleCorporateInquiry(new Request("https://portal.test/api/corporate-inquiries", {
      method: "OPTIONS", headers: { Origin: "https://website.test", "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type, Idempotency-Key" }
    }));
    expect(response.status).toBe(204);
    expect(getCorporateConfig).not.toHaveBeenCalled();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects unapproved origins without reflecting them", async () => {
    const response = await handleCorporateInquiry(request(answers, "https://attacker.test"));
    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(getDb).not.toHaveBeenCalled();
  });

  it("rejects a missing idempotency key", async () => {
    const req = request(); req.headers.delete("idempotency-key");
    expect((await handleCorporateInquiry(req)).status).toBe(400);
    expect(getDb).not.toHaveBeenCalled();
  });
});
