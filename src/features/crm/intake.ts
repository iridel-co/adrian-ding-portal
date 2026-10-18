import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getDb } from "@/db";
import { getCorporateConfig, getCorporateOrigins } from "./config";
import { sendEmailJob } from "./email";
import { IntakeError, IntakeErrorCode } from "./errors";
import { handleOptions, readJson } from "./http";
import { corporateInquirySchema, idempotencyKeySchema } from "./schemas";
import { acceptCorporateInquiry } from "./service";
import { verifyCorporateTurnstile } from "./turnstile";

const submissionSchema = corporateInquirySchema.safeExtend({
  website: z.string().max(200).default(""),
  turnstileToken: z.string().min(1).max(2048)
});

export async function handleCorporateInquiry(request: Request) {
  const headers = new Headers({ Vary: "Origin", "Cache-Control": "no-store" });
  try {
    const origins = getCorporateOrigins();
    const origin = request.headers.get("origin");
    if (!origin || !origins.includes(origin)) throw new IntakeError(403, IntakeErrorCode.OriginNotAllowed);
    headers.set("Access-Control-Allow-Origin", origin);
    if (request.method === "OPTIONS") return handleOptions(request, headers);
    if (request.method !== "POST") throw new IntakeError(405, IntakeErrorCode.MethodNotAllowed);
    return await handlePost(request, headers, origins);
  } catch (error) {
    const failure = error instanceof IntakeError ? error : new IntakeError(503, IntakeErrorCode.IntakeUnavailable);
    return Response.json({ error: failure.code }, { status: failure.status, headers });
  }
}

async function handlePost(request: Request, headers: Headers, origins: string[]) {
  const config = getCorporateConfig();
  const key = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!key.success) throw new IntakeError(400, IntakeErrorCode.InvalidIdempotencyKey);
  const parsed = submissionSchema.safeParse(await readJson(request));
  if (!parsed.success) throw new IntakeError(400, IntakeErrorCode.InvalidSubmission);
  const { website, turnstileToken, ...answers } = parsed.data;
  if (website) throw new IntakeError(400, IntakeErrorCode.SubmissionRejected);
  // Verify every attempt; a retry needs a fresh token, which is excluded from the saved hash.
  await verifyCorporateTurnstile(turnstileToken, config.TURNSTILE_SECRET_KEY, origins);
  const db = getDb();
  const jobs = await acceptCorporateInquiry(db, answers, key.data, config);
  if (config.CORPORATE_EMAIL_ENABLED) {
    // The inquiry and both snapshots are committed before any provider call.
    await Promise.allSettled(jobs.map(id => sendEmailJob(db, id, config.RESEND_API_KEY)));
  }
  return Response.json({ accepted: true }, { status: 202, headers });
}
