import { afterEach, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { getRegistrationConfig } from "./config";
afterEach(() => vi.unstubAllEnvs());
it("enables registration without corporate or mail settings", () => {
  vi.stubEnv("REGISTRATION_INTAKE_ENABLED", "true");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
  vi.stubEnv("CORPORATE_INTAKE_ENABLED", "false");
  expect(getRegistrationConfig()).toEqual({ TURNSTILE_SECRET_KEY: "secret" });
});
it.each(["false", "", "TRUE"])("fails closed for intake flag %s", flag => {
  vi.stubEnv("REGISTRATION_INTAKE_ENABLED", flag);
  vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
  expect(() => getRegistrationConfig()).toThrow("intake_unavailable");
});
it("requires a configured bot secret", () => {
  vi.stubEnv("REGISTRATION_INTAKE_ENABLED", "true");
  vi.stubEnv("TURNSTILE_SECRET_KEY", "");
  expect(() => getRegistrationConfig()).toThrow("intake_unavailable");
});
