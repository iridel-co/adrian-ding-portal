import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getDb } from "@/db";
import { getIntakeOrigins, getRegistrationConfig } from "./config";
import { sendEmailJob } from "./email";
import { IntakeError, IntakeErrorCode } from "./errors";
import { handleOptions, readJson } from "./http";
import { idempotencyKeySchema, registrationSchema } from "./schemas";
import { acceptRegistration } from "./registration-service";
import { verifyTurnstile } from "./turnstile";

const submissionSchema = registrationSchema.extend({
  website: z.string().max(200).default(""),
  turnstileToken: z.string().min(1).max(2048)
});

export async function handleRegistration(request: Request) {
  const headers = new Headers({ Vary: "Origin", "Cache-Control": "no-store" });
  try {
    const origins = getIntakeOrigins();
    const origin = request.headers.get("origin");
    if (!origin || !origins.includes(origin)) throw new IntakeError(403, IntakeErrorCode.OriginNotAllowed);
    headers.set("Access-Control-Allow-Origin", origin);
    if (request.method === "OPTIONS") return handleOptions(request, headers);
    if (request.method !== "POST") throw new IntakeError(405, IntakeErrorCode.MethodNotAllowed);
    const config = getRegistrationConfig();
    const key = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
    if (!key.success) throw new IntakeError(400, IntakeErrorCode.InvalidIdempotencyKey);
    const parsed = submissionSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new IntakeError(400, IntakeErrorCode.InvalidSubmission);
    const { website, turnstileToken, ...answers } = parsed.data;
    if (website) throw new IntakeError(400, IntakeErrorCode.SubmissionRejected);
    // Every retry needs a fresh token; only accepted answers enter the payload hash.
    await verifyTurnstile(turnstileToken, config.TURNSTILE_SECRET_KEY, origins, "workshop-registration");
    const db = getDb();
    const { response, jobs } = await acceptRegistration(db, answers, key.data, config);
    // Delivery failures cannot undo an accepted registration and its saved message.
    if (config.REGISTRATION_EMAIL_ENABLED) {
      await Promise.allSettled(jobs.map(id => sendEmailJob(db, id, config.RESEND_API_KEY)));
    }
    return Response.json(response, { status: 202, headers });
  } catch (error) {
    const failure = error instanceof IntakeError ? error : new IntakeError(503, IntakeErrorCode.IntakeUnavailable);
    return Response.json({ error: failure.code }, { status: failure.status, headers });
  }
}
