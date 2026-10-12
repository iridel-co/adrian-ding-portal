import "@tanstack/react-start/server-only";
import { z } from "zod";
import { IntakeError } from "./errors";

const originsSchema = z.string().default("").transform(value => value.split(",").map(value => value.trim()).filter(Boolean))
  .pipe(z.array(z.url().refine(value => {
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && value === url.origin;
    } catch { return false; }
  })).min(1));

export function getCorporateOrigins() {
  const result = originsSchema.safeParse(process.env.SITE_ORIGINS);
  if (!result.success) throw new IntakeError(503, "intake_unavailable");
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

export function getCorporateConfig() {
  if (process.env.CORPORATE_INTAKE_ENABLED !== "true") throw new IntakeError(503, "intake_unavailable");
  const secret = z.string().min(1).safeParse(process.env.TURNSTILE_SECRET_KEY);
  if (!secret.success) throw new IntakeError(503, "intake_unavailable");
  return { ...getCorporateMailConfig(), TURNSTILE_SECRET_KEY: secret.data };
}

export function getCorporateMailConfig() {
  const result = configSchema.safeParse(process.env);
  if (!result.success) throw new IntakeError(503, "intake_unavailable");
  const config = result.data;
  if (config.CORPORATE_EMAIL_ENABLED && (!config.RESEND_API_KEY
    || /example\.|\.invalid|\[|\]/i.test([config.CORPORATE_EMAIL_FROM, config.CORPORATE_REPLY_TO,
      ...config.CORPORATE_INQUIRY_RECIPIENTS, config.CORPORATE_TEAM_PHONE, config.CORPORATE_CREDIBILITY_LINE].join(" ")))) {
    throw new IntakeError(503, "intake_unavailable");
  }
  return { ...config, EMAIL_FROM: config.CORPORATE_EMAIL_FROM, EMAIL_REPLY_TO: config.CORPORATE_REPLY_TO };
}
