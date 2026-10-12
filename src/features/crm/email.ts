import "@tanstack/react-start/server-only";

import type { CrmEmailPayload } from "@/db/schema";

class DeliveryError extends Error {
  constructor(public code: string) { super(code); }
}

export async function sendViaResend(payload: CrmEmailPayload, key: string, apiKey: string) {
  const { replyTo, attachments, ...message } = payload;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(10000), redirect: "error",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ ...message, ...(replyTo ? { reply_to: replyTo } : {}),
      ...(attachments ? { attachments: attachments.map(({ filename, content }) => ({ filename, content })) } : {}) })
  });
  if (!response.ok) throw new DeliveryError(response.status === 409 ? "provider_conflict" : response.status === 429 ? "provider_throttled" : "provider_rejected");
  const body: unknown = await response.json();
  if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !body.id.trim() || body.id.length > 256) {
    throw new DeliveryError("provider_response_invalid");
  }
  return { id: body.id };
}
