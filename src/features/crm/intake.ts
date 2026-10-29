import "@tanstack/react-start/server-only";
import { z } from "zod";
import { getDb } from "@/db";
import { getCorporateConfig, getCorporateOrigins } from "./config";
import { sendEmailJob } from "./email";
import { IntakeError, IntakeErrorCode } from "./errors";
import { handleOptions, readJson } from "./http";
import { corporateInquirySubmissionSchema, idempotencyKeySchema } from "./schemas";
import { acceptCorporateInquiry } from "./service";
import { verifyCorporateTurnstile } from "./turnstile";

export async function handleCorporateInquiry(request: Request) {
  const headers = new Headers({ Vary: "Origin", "Cache-Control": "no-store" });
  const context = { stage: "origin_config" };
  try {
    const origins = getCorporateOrigins();
    context.stage = "origin_check";
    const origin = request.headers.get("origin");
    if (!origin || !origins.includes(origin)) throw new IntakeError(403, IntakeErrorCode.OriginNotAllowed);
    headers.set("Access-Control-Allow-Origin", origin);
    context.stage = "method";
    if (request.method === "OPTIONS") return handleOptions(request, headers);
    if (request.method !== "POST") throw new IntakeError(405, IntakeErrorCode.MethodNotAllowed);
    return await handlePost(request, headers, origins, context);
  } catch (error) {
    const failure = error instanceof IntakeError ? error : new IntakeError(503, IntakeErrorCode.IntakeUnavailable);
    console.error(JSON.stringify({ event: "crm_intake_failed", form: "corporate", stage: context.stage,
      status: failure.status, code: failure.code, unexpected: !(error instanceof IntakeError),
      fields: error instanceof z.ZodError ? [...new Set(error.issues.filter(issue => issue.path.length > 0).map(issue => String(issue.path[0])))] : undefined }));
    return Response.json({ error: failure.code }, { status: failure.status, headers });
  }
}

async function handlePost(request: Request, headers: Headers, origins: string[], context: { stage: string }) {
  context.stage = "config";
  const config = getCorporateConfig();
  context.stage = "validation";
  const key = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
  if (!key.success) throw new IntakeError(400, IntakeErrorCode.InvalidIdempotencyKey);
  const schema = config.TURNSTILE_SECRET_KEY ? corporateInquirySubmissionSchema
    : corporateInquirySubmissionSchema.safeExtend({ turnstileToken: z.string().max(2048) });
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) throw new IntakeError(400, IntakeErrorCode.InvalidSubmission);
  const { website, turnstileToken, ...answers } = parsed.data;
  if (website) throw new IntakeError(400, IntakeErrorCode.SubmissionRejected);
  context.stage = "verification";
  // Verify every attempt; a retry needs a fresh token, which is excluded from the saved hash.
  if (config.TURNSTILE_SECRET_KEY) await verifyCorporateTurnstile(turnstileToken, config.TURNSTILE_SECRET_KEY, origins);
  context.stage = "database";
  const db = getDb();
  context.stage = "save";
  const jobs = await acceptCorporateInquiry(db, answers, key.data, config);
  context.stage = "email";
  if (config.CORPORATE_EMAIL_ENABLED) {
    // The inquiry and both snapshots are committed before any provider call.
    await Promise.allSettled(jobs.map(id => sendEmailJob(db, id, config.RESEND_API_KEY)));
  }
  console.info(JSON.stringify({ event: "crm_intake_accepted", form: "corporate", status: 202 }));
  return Response.json({ accepted: true }, { status: 202, headers });
}
