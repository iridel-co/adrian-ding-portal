import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { getCorporateConfig, getCorporateMailConfig, getCorporateOrigins } from "./config";

afterEach(() => vi.unstubAllEnvs());
describe("Corporate intake configuration", () => {
  beforeEach(() => {
  vi.stubEnv("TURNSTILE_ENABLED", "true");
    vi.stubEnv("CORPORATE_INTAKE_ENABLED", "true");
    vi.stubEnv("CORPORATE_EMAIL_ENABLED", "false");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-secret");
    vi.stubEnv("SITE_ORIGINS", "https://website.test,http://localhost:4321");
    vi.stubEnv("CORPORATE_EMAIL_FROM", "Team <team@example.invalid>");
    vi.stubEnv("CORPORATE_REPLY_TO", "sales@example.invalid");
    vi.stubEnv("CORPORATE_INQUIRY_RECIPIENTS", "primary@example.invalid,secondary@example.invalid");
    vi.stubEnv("CORPORATE_PORTAL_URL", "https://portal.test/");
    vi.stubEnv("CORPORATE_TEAM_PHONE", "[TEAM_PHONE]");
    vi.stubEnv("CORPORATE_CREDIBILITY_LINE", "[APPROVED_CREDIBILITY_LINE]");
    vi.stubEnv("RESEND_API_KEY", "");
  });
  it("allows placeholders only with sending disabled, independently of payment settings", () => {
    const config = getCorporateConfig();
    expect(config.CORPORATE_EMAIL_ENABLED).toBe(false);
    expect(config.CORPORATE_PORTAL_URL).toBe("https://portal.test");
    expect(config.CORPORATE_INQUIRY_RECIPIENTS).toHaveLength(2);
    expect(getCorporateOrigins()).toEqual(["https://website.test", "http://localhost:4321"]);
  });
  it("refuses enabled delivery with placeholders or a missing provider key", () => {
    vi.stubEnv("CORPORATE_EMAIL_ENABLED", "true");
    expect(getCorporateConfig).toThrow("intake_unavailable");
    vi.stubEnv("RESEND_API_KEY", "test-key");
    expect(getCorporateConfig).toThrow("intake_unavailable");
    vi.stubEnv("CORPORATE_EMAIL_FROM", "Team <team@company.test>");
    vi.stubEnv("CORPORATE_REPLY_TO", "sales@company.test");
    vi.stubEnv("CORPORATE_INQUIRY_RECIPIENTS", "primary@company.test,secondary@company.test");
    vi.stubEnv("CORPORATE_TEAM_PHONE", "+63 917 1234567");
    vi.stubEnv("CORPORATE_CREDIBILITY_LINE", "Approved credibility statement.");
    expect(getCorporateConfig().CORPORATE_EMAIL_ENABLED).toBe(true);
  });
  it("requires distinct primary and secondary recipients", () => {
    vi.stubEnv("CORPORATE_INQUIRY_RECIPIENTS", "same@company.test,same@company.test");
    expect(getCorporateConfig).toThrow("intake_unavailable");
  });
  it("keeps intake disabled until explicitly enabled", () => {
    vi.stubEnv("CORPORATE_INTAKE_ENABLED", "false");
    expect(getCorporateConfig).toThrow("intake_unavailable");
  });
  it("reads mail settings for staff recovery without requiring public intake or a bot secret", () => {
    vi.stubEnv("CORPORATE_INTAKE_ENABLED", "false");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(getCorporateMailConfig().EMAIL_REPLY_TO).toBe("sales@example.invalid");
  });
  it.each(["*", "https://website.test/path", "https://website.test/", "ftp://website.test"])('rejects unsafe origin configuration %s', origin => {
    vi.stubEnv("SITE_ORIGINS", origin);
    expect(getCorporateOrigins).toThrow("intake_unavailable");
  });

it("allows an explicit diagnostic bypass without a Turnstile secret", () => {
  vi.stubEnv("CORPORATE_INTAKE_ENABLED", "true");
  vi.stubEnv("TURNSTILE_ENABLED", "false");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  expect(getCorporateConfig().TURNSTILE_SECRET_KEY).toBe("");
  vi.stubEnv("CORPORATE_INTAKE_ENABLED", "false");
  expect(() => getCorporateConfig()).toThrow("intake_unavailable");
});

it.each([undefined, "", "FALSE", "true"])("requires verification unless explicitly disabled: %s", flag => {
  vi.stubEnv("CORPORATE_INTAKE_ENABLED", "true");
  vi.stubEnv("TURNSTILE_ENABLED", flag);
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  expect(() => getCorporateConfig()).toThrow("intake_unavailable");
});

});
