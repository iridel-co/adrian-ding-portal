import "@tanstack/react-start/server-only";
import { z } from "zod";
import { IntakeError } from "./errors";

const resultSchema = z.object({ success: z.boolean(), hostname: z.string().optional(), action: z.string().optional(),
  "error-codes": z.array(z.string()).optional() });

export async function verifyCorporateTurnstile(token: string, secret: string, origins: string[]) {
  let result: z.infer<typeof resultSchema>;
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(5000),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret, response: token })
    });
    if (!response.ok) throw new Error("verification unavailable");
    result = resultSchema.parse(await response.json());
  } catch { throw new IntakeError(503, "verification_unavailable"); }
  if (!result.success) {
    const unavailable = result["error-codes"]?.some(code => ["missing-input-secret", "invalid-input-secret", "internal-error"].includes(code));
    throw new IntakeError(unavailable ? 503 : 400, unavailable ? "verification_unavailable" : "verification_failed");
  }
  if (result.action !== "corporate-inquiry" || !origins.some(origin => new URL(origin).hostname === result.hostname)) {
    throw new IntakeError(400, "verification_failed");
  }
}
