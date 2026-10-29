import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { getRegistrationConfig, getRegistrationMailConfig } from "./config";
beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("TURNSTILE_ENABLED", "true");
  vi.stubEnv("REGISTRATION_PAYMENT_ACCOUNT_ID", "12345678-abcd-4000-8000-123456789abc");
  vi.stubEnv("REGISTRATION_EMAIL_ENABLED", "false");
  vi.stubEnv("REGISTRATION_EMAIL_FROM", "Team <registrations@example.invalid>");
  vi.stubEnv("REGISTRATION_REPLY_TO", "registrations@example.invalid");
  vi.stubEnv("RESEND_API_KEY", "");
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("enables registration without corporate or mail settings", () => {
  vi.stubEnv("REGISTRATION_INTAKE_ENABLED", "true");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
  vi.stubEnv("CORPORATE_INTAKE_ENABLED", "false");
  expect(getRegistrationConfig()).toMatchObject({ TURNSTILE_SECRET_KEY: "", REGISTRATION_EMAIL_ENABLED: false });
});
it.each(["false", "", "TRUE"])("fails closed for intake flag %s", flag => {
  vi.stubEnv("REGISTRATION_INTAKE_ENABLED", flag);
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
  expect(() => getRegistrationConfig()).toThrow("intake_unavailable");
});

it("rejects enabled workshop email with placeholders or no provider key", () => {
  vi.stubEnv("REGISTRATION_EMAIL_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "synthetic-key");
  expect(() => getRegistrationMailConfig()).toThrow("email_unavailable");
  vi.stubEnv("REGISTRATION_EMAIL_FROM", "Team <registrations@company.test>");
  vi.stubEnv("REGISTRATION_REPLY_TO", "registrations@company.test");
  expect(getRegistrationMailConfig().REGISTRATION_EMAIL_ENABLED).toBe(true);
  vi.stubEnv("RESEND_API_KEY", "");
  expect(() => getRegistrationMailConfig()).toThrow("email_unavailable");
});
it("reads recovery mail configuration without enabling public intake", () => {
  vi.stubEnv("REGISTRATION_INTAKE_ENABLED", "false");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  expect(getRegistrationMailConfig().REGISTRATION_EMAIL_ENABLED).toBe(false);
});
it.each(["bad", ""])("requires a selected payment account: %s", value => {
  vi.stubEnv("REGISTRATION_PAYMENT_ACCOUNT_ID", value);
  expect(() => getRegistrationMailConfig()).toThrow("intake_unavailable");
});
it.each(["bad", "Injected\r\nBcc: other@company.test"])("rejects invalid sender headers", value => {
  vi.stubEnv("REGISTRATION_EMAIL_FROM", value);
  expect(() => getRegistrationMailConfig()).toThrow("intake_unavailable");
});

it.each([undefined, "false", "true"])("bypasses Turnstile regardless of the env flag: %s", flag => {
  vi.stubEnv("REGISTRATION_INTAKE_ENABLED", "true");
  vi.stubEnv("TURNSTILE_ENABLED", flag);
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  expect(getRegistrationConfig().TURNSTILE_SECRET_KEY).toBe("");
  vi.stubEnv("REGISTRATION_INTAKE_ENABLED", "false");
  expect(() => getRegistrationConfig()).toThrow("intake_unavailable");
});

it("logs the invalid payment-account field without its value", () => {
  vi.stubEnv("REGISTRATION_PAYMENT_ACCOUNT_ID", "private-invalid-account");
  expect(getRegistrationMailConfig).toThrow("intake_unavailable");
  expect(JSON.parse(vi.mocked(console.error).mock.calls[0][0])).toEqual({
    event: "crm_intake_config_invalid", reason: "invalid_format", fields: ["REGISTRATION_PAYMENT_ACCOUNT_ID"]
  });
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-invalid-account");
});
