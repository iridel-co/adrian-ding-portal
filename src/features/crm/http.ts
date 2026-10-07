import "@tanstack/react-start/server-only";
import { getDb, type Db } from "@/db";
import { getCrmEnv, getSiteOrigins, type CrmEnv } from "@/lib/env";
import { sendEmailJob, type EmailTransport } from "./email";
import { corporateInquirySchema, idempotencyKeySchema, registrationSchema } from "./schemas";
import { acceptCorporateInquiry, acceptRegistration, IntakeError, type SubmissionKind } from "./service";

// Implementation bound on actual bytes, independent of individual text limits.
const MAX_BODY_BYTES = 64 * 1024;

async function readJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new IntakeError(415, "unsupported_content_type");
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new IntakeError(413, "body_too_large");
  if (!request.body) throw new IntakeError(400, "invalid_json");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 5000);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (timedOut) throw new IntakeError(408, "request_timeout");
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new IntakeError(413, "body_too_large");
      }
      chunks.push(value);
    }
  } finally { clearTimeout(timeout); reader.releaseLock(); }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown; }
  catch { throw new IntakeError(400, "invalid_json"); }
}

export async function handleSubmission(request: Request, kind: SubmissionKind, dependencies?: { db: Db; config: CrmEnv; emailTransport?: EmailTransport }) {
  const headers = new Headers({ "Vary": "Origin", "Cache-Control": "no-store" });
  const respond = (status: number, body?: unknown) => {
    if (body !== undefined) headers.set("Content-Type", "application/json");
    return new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
  };
  try {
    const origins = dependencies?.config.SITE_ORIGINS ?? getSiteOrigins();
    const origin = request.headers.get("origin");
    if (origin !== null) {
      if (!origins.includes(origin)) throw new IntakeError(403, "origin_not_allowed");
      headers.set("Access-Control-Allow-Origin", origin);
    }
    if (request.method === "OPTIONS") {
      const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
      if (request.headers.get("access-control-request-method") !== "POST"
        || requestedHeaders.some(value => !["content-type", "idempotency-key"].includes(value))) throw new IntakeError(403, "preflight_not_allowed");
      headers.set("Access-Control-Allow-Methods", "POST");
      headers.set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key");
      return respond(204);
    }
    if (request.method !== "POST") { headers.set("Allow", "POST, OPTIONS"); throw new IntakeError(405, "method_not_allowed"); }
    const config = dependencies?.config ?? getCrmEnv();
    if (!config.CRM_INTAKE_ENABLED) throw new IntakeError(503, "intake_unavailable");
    const key = idempotencyKeySchema.safeParse(request.headers.get("idempotency-key"));
    if (!key.success) throw new IntakeError(400, "invalid_idempotency_key");
    const body = await readJson(request);
    const invalid = (issues: { path: PropertyKey[] }[]) => respond(400, { error: {
      code: "invalid_submission", fields: [...new Set(issues.map(issue => issue.path.join(".") || "body"))]
    } });
    let jobs: string[];
    let db: Db;
    if (kind === "registration") {
      const parsed = registrationSchema.safeParse(body);
      if (!parsed.success) return invalid(parsed.error.issues);
      db = dependencies?.db ?? getDb();
      jobs = await acceptRegistration(db, parsed.data, key.data, config);
    } else {
      const parsed = corporateInquirySchema.safeParse(body);
      if (!parsed.success) return invalid(parsed.error.issues);
      db = dependencies?.db ?? getDb();
      jobs = await acceptCorporateInquiry(db, parsed.data, key.data, config);
    }
    // Persistence already committed. A send/state-write failure must not turn
    // a saved signup into a failed acknowledgment or lose its recoverable job.
    await Promise.allSettled(jobs.map(id => sendEmailJob(db, id, config.RESEND_API_KEY, dependencies?.emailTransport)));
    return respond(202, { accepted: true });
  } catch (error) {
    // Never return SQL errors, configuration values, or submitted contact data.
    return respond(error instanceof IntakeError ? error.status : 503,
      { error: { code: error instanceof IntakeError ? error.code : "intake_unavailable" } });
  }
}
