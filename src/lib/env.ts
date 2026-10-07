import "@tanstack/react-start/server-only";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
});

let env: z.infer<typeof envSchema> | undefined;

/*
  Env is read on first use, not at import time. On Cloudflare Workers the
  env vars may not be filled in until the first request comes in.
*/
export function getEnv() {
  env ??= envSchema.parse(process.env);
  return env;
}

const r2EnvSchema = z.object({
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.url().transform((url) => url.replace(/\/+$/, ""))
});

let r2Env: z.infer<typeof r2EnvSchema> | undefined;

/* R2 settings are read only when media features run, so the app starts without them. */
export function getR2Env() {
  r2Env ??= r2EnvSchema.parse(process.env);
  return r2Env;
}

const siteOriginsSchema = z.string().transform(value => value.split(",").map(origin => origin.trim()))
  .pipe(z.array(z.url().refine(value => /^https?:\/\//.test(value) && new URL(value).origin === value, "Use an exact HTTP(S) origin.")).min(1));

export function getSiteOrigins() {
  return siteOriginsSchema.parse(process.env.SITE_ORIGINS);
}

const crmEnvSchema = z.object({
  // Keep intake closed until email delivery and deployment abuse controls are ready.
  CRM_INTAKE_ENABLED: z.enum(["true", "false"]).default("false").transform(value => value === "true"),
  SITE_ORIGINS: siteOriginsSchema,
  PAYMENT_ACCOUNT_ID: z.uuid(),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().trim().max(320).refine(value => {
    if (/[\r\n]/.test(value)) return false;
    const address = value.match(/^[^<>]+<([^<>]+)>$/)?.[1] ?? value;
    return z.email().safeParse(address).success;
  }, "Use an email address or Name <email>."),
  EMAIL_REPLY_TO: z.email(),
  CORPORATE_INQUIRY_RECIPIENTS: z.string().transform(value => value.split(",").map(email => email.trim()))
    .pipe(z.array(z.email()).min(1))
});

export type CrmEnv = z.output<typeof crmEnvSchema>;

// Validate only when public CRM routes run. Incomplete CRM settings do not
// prevent existing CMS/auth routes from starting.
export function getCrmEnv(): CrmEnv {
  return crmEnvSchema.parse(process.env);
}
