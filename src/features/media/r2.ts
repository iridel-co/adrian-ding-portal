import "@tanstack/react-start/server-only";
import { AwsClient } from "aws4fetch";

import { getR2Env } from "@/lib/env";

const UPLOAD_URL_TTL_SECONDS = 600;

let client: AwsClient | undefined;

function getClient() {
  const env = getR2Env();
  client ??= new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    service: "s3",
    region: "auto"
  });
  return client;
}

function objectUrl(key: string) {
  const env = getR2Env();
  return new URL(`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`);
}

/* A URL the browser can PUT the file to directly. The PUT must send the same Content-Type. */
export async function createUploadUrl(key: string, contentType: string) {
  const url = objectUrl(key);
  url.searchParams.set("X-Amz-Expires", String(UPLOAD_URL_TTL_SECONDS));

  const signed = await getClient().sign(
    new Request(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType
      }
    }),
    {
      aws: {
        signQuery: true
      }
    }
  );

  return signed.url;
}

/* Size and type of a stored object, or null when it does not exist. */
export async function headObject(key: string) {
  const response = await getClient().fetch(objectUrl(key), { method: "HEAD" });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`R2 HEAD ${key} failed with status ${response.status}.`);
  }

  return {
    sizeBytes: Number(response.headers.get("content-length") ?? 0),
    contentType: response.headers.get("content-type") ?? ""
  };
}

export function publicMediaUrl(key: string) {
  return `${getR2Env().R2_PUBLIC_BASE_URL}/${key}`;
}

/* Snapshot a small payment QR before its email job is saved. Fetch only from
   our configured R2 bucket, never from a URL supplied by a form. */
export async function readPaymentQr(qr: { key: string; contentType: string; sizeBytes: number }) {
  const limit = 1024 * 1024;
  if (qr.sizeBytes <= 0 || qr.sizeBytes > limit) throw new Error("Payment QR exceeds the attachment limit.");
  const signed = await getClient().sign(objectUrl(qr.key), { signal: AbortSignal.timeout(5000), redirect: "error" });
  const response = await fetch(signed);
  if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== qr.contentType || !response.body) {
    throw new Error("Payment QR is unavailable.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { void reader.cancel().catch(() => {}); throw new Error("Payment QR exceeds the attachment limit."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if (size !== qr.sizeBytes) throw new Error("Payment QR metadata changed.");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  // Signatures catch an HTML/error document incorrectly labelled as an image.
  const isImage = qr.contentType === "image/png" ? [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value)
    : qr.contentType === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : qr.contentType === "image/webp" && new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP";
  if (!isImage) throw new Error("Payment QR is not a supported image.");
  // Chunk conversion avoids the argument limit of String.fromCharCode(...bytes).
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return { filename: `payment-qr.${qr.contentType === "image/jpeg" ? "jpg" : qr.contentType.split("/")[1]}`, content: btoa(binary), contentType: qr.contentType };
}
