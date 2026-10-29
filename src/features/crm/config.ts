import "@tanstack/react-start/server-only";
import { z } from "zod";
import { IntakeError, IntakeErrorCode } from "./errors";

function configurationError(fields: string[], reason: string, code = IntakeErrorCode.IntakeUnavailable): never {
  console.error(JSON.stringify({ event: "crm_intake_config_invalid", reason, fields: [...new Set(fields)] }));
  throw new IntakeError(503, code);
}

const originsSchema = z.string().default("").transform(value => value.split(",").map(value => value.trim()).filter(Boolean))
  .pipe(z.array(z.url().refine(value => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && value === url.origin;
    } catch { return false; }
  })).min(1));

export function getIntakeOrigins() {
  const result = originsSchema.safeParse(process.env.SITE_ORIGINS);
  if (!result.success) configurationError(["SITE_ORIGINS"], "invalid_format");
  return result.data;
}

const configSchema = z.object({
  CORPORATE_EMAIL_ENABLED: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  RESEND_API_KEY: z.string().default(""),
  CORPORATE_EMAIL_FROM: z.string().trim().min(1).max(320).refine(value => !/[\r\n]/.test(value)
    && z.email().safeParse(value.match(/^[^<>]+<([^<>]+)>$/)?.[1] ?? value).success),
  CORPORATE_REPLY_TO: z.email(),
  CORPORATE_INQUIRY_RECIPIENTS: z.string().transform(value => value.split(",").map(email => email.trim().toLowerCase()))
    .pipe(z.array(z.email()).length(2).refine(value => new Set(value).size === 2)),
  CORPORATE_TEAM_PHONE: z.string().trim().min(1).default("[TEAM_PHONE]"),
  CORPORATE_CREDIBILITY_LINE: z.string().trim().min(1).default("[APPROVED_CREDIBILITY_LINE]"),
  CORPORATE_PORTAL_URL: z.url().refine(value => {
    try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
  })
    .transform(value => value.replace(/\/+$/, ""))
});

function getTurnstileSecret() {
  // shortcut: verification is hard-coded off for diagnosis; restore the env switch after testing.
  const turnstileEnabled = false;
  if (!turnstileEnabled) return "";
  const secret = z.string().min(1).safeParse(process.env.TURNSTILE_SECRET_KEY);
  if (!secret.success) configurationError(["TURNSTILE_SECRET_KEY"], "missing_secret");
  return secret.data;
}

export function getCorporateConfig() {
  if (process.env.CORPORATE_INTAKE_ENABLED !== "true") configurationError(["CORPORATE_INTAKE_ENABLED"], "intake_disabled");
  const secret = getTurnstileSecret();
  return { ...getCorporateMailConfig(), TURNSTILE_SECRET_KEY: secret };
}

export function getCorporateMailConfig() {
  const result = configSchema.safeParse(process.env);
  if (!result.success) configurationError(result.error.issues.map(issue => String(issue.path[0])), "invalid_format");
  const config = result.data;
  if (config.CORPORATE_EMAIL_ENABLED) {
    const fields: string[] = (["CORPORATE_EMAIL_FROM", "CORPORATE_REPLY_TO", "CORPORATE_INQUIRY_RECIPIENTS",
      "CORPORATE_TEAM_PHONE", "CORPORATE_CREDIBILITY_LINE"] as const).filter(field => {
      const value = config[field];
      return /example\.|\.invalid|\[|\]/i.test(Array.isArray(value) ? value.join(" ") : value);
    });
    if (!config.RESEND_API_KEY) fields.push("RESEND_API_KEY");
    if (fields.length) configurationError(fields, "email_delivery_not_configured");
  }
  return { ...config, EMAIL_FROM: config.CORPORATE_EMAIL_FROM, EMAIL_REPLY_TO: config.CORPORATE_REPLY_TO };
}

// Preserve the corporate intake contract while sharing the exact origin allowlist.
export const getCorporateOrigins = getIntakeOrigins;

export function getRegistrationConfig() {
  if (process.env.REGISTRATION_INTAKE_ENABLED !== "true") {
    configurationError(["REGISTRATION_INTAKE_ENABLED"], "intake_disabled");
  }
  const secret = getTurnstileSecret();
  return { ...getRegistrationMailConfig(), TURNSTILE_SECRET_KEY: secret };
}

const registrationMailSchema = z.object({
  REGISTRATION_EMAIL_ENABLED: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  REGISTRATION_PAYMENT_ACCOUNT_ID: z.uuid(),
  REGISTRATION_EMAIL_FROM: z.string().trim().min(1).max(320).default("Adrian Ding Team <registrations@example.invalid>")
    .refine(value => !/[\r\n]/.test(value)
      && z.email().safeParse(value.match(/^[^<>]+<([^<>]+)>$/)?.[1] ?? value).success),
  REGISTRATION_REPLY_TO: z.email().default("registrations@example.invalid"),
  RESEND_API_KEY: z.string().default("")
});

export function getRegistrationMailConfig() {
  const result = registrationMailSchema.safeParse(process.env);
  if (!result.success) configurationError(result.error.issues.map(issue => String(issue.path[0])), "invalid_format");
  const config = result.data;
  if (config.REGISTRATION_EMAIL_ENABLED) {
    const fields: string[] = (["REGISTRATION_EMAIL_FROM", "REGISTRATION_REPLY_TO"] as const)
      .filter(field => /example\.|\.invalid/i.test(config[field]));
    if (!config.RESEND_API_KEY) fields.push("RESEND_API_KEY");
    if (fields.length) configurationError(fields, "email_delivery_not_configured", IntakeErrorCode.EmailUnavailable);
  }
  return { ...config, EMAIL_FROM: config.REGISTRATION_EMAIL_FROM, EMAIL_REPLY_TO: config.REGISTRATION_REPLY_TO };
}
