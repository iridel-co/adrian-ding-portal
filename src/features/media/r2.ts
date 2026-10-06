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
