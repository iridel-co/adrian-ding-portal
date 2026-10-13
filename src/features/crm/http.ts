import "@tanstack/react-start/server-only";
import { IntakeError, IntakeErrorCode } from "./errors";

// Implementation bound on actual bytes, independent of individual text limits.
const MAX_BODY_BYTES = 64 * 1024;

export async function readJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new IntakeError(415, IntakeErrorCode.UnsupportedContentType);
  }
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) throw new IntakeError(413, IntakeErrorCode.BodyTooLarge);
  if (!request.body) throw new IntakeError(400, IntakeErrorCode.InvalidJson);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, 5000);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (timedOut) throw new IntakeError(408, IntakeErrorCode.RequestTimeout);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new IntakeError(413, IntakeErrorCode.BodyTooLarge);
      }
      chunks.push(value);
    }
  } finally { clearTimeout(timeout); reader.releaseLock(); }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown; }
  catch { throw new IntakeError(400, IntakeErrorCode.InvalidJson); }
}
