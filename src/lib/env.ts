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
