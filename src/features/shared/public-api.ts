import "@tanstack/react-start/server-only";
import { z } from "zod";

import { publicMediaUrl } from "@/features/media/r2";
import { NotFoundError } from "@/features/shared/errors";
import { getPublicApiEnv } from "@/lib/env";

export type PublicMedia = {
  url: string;
  alt: string;
  width: number | null;
  height: number | null;
};

type MediaRow = {
  key: string;
  alt: string;
  width: number | null;
  height: number | null;
};

/* Archived media is excluded by the query, so a missing row means "no image". */
export function toPublicMedia(
  row: MediaRow | null | undefined,
  toUrl: (key: string) => string = publicMediaUrl
): PublicMedia | null {
  if (!row) return null;
  return { url: toUrl(row.key), alt: row.alt, width: row.width, height: row.height };
}

export type Price = { centavos: number; currency: "PHP"; note: string };

export function toPrice(centavos: number, note: string): Price;
export function toPrice(centavos: number | null, note: string): Price | null;
export function toPrice(centavos: number | null, note: string): Price | null {
  if (centavos === null) return null;
  return { centavos, currency: "PHP", note };
}

export const CACHE_CONTROL = {
  ok: "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
  notFound: "public, max-age=0, s-maxage=60",
  noStore: "no-store"
} as const;

/* Echoes an allowed origin, or allows any origin when none are configured. */
export function corsHeaders(origin: string | null, allowedOrigins: string[]) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
    "Access-Control-Expose-Headers": "ETag"
  };

  if (allowedOrigins.length === 0) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else {
    headers.Vary = "Origin";
    if (origin && allowedOrigins.includes(origin)) {
      headers["Access-Control-Allow-Origin"] = origin;
    }
  }
  return headers;
}

function requestCorsHeaders(request: Request) {
  return corsHeaders(request.headers.get("Origin"), getPublicApiEnv().PUBLIC_SITE_ORIGIN);
}

export function json(
  data: unknown,
  cacheControl: string,
  cors: Record<string, string>,
  status: HttpStatus = HttpStatus.Ok
) {
  return Response.json(data, {
    status,
    headers: { ...cors, "Cache-Control": cacheControl }
  });
}

export enum HttpStatus {
  Ok = 200,
  NoContent = 204,
  NotModified = 304,
  BadRequest = 400,
  NotFound = 404,
  MethodNotAllowed = 405,
  InternalServerError = 500
}

export enum ApiErrorCode {
  InvalidRequest = "invalid_request",
  NotFound = "not_found",
  MethodNotAllowed = "method_not_allowed",
  InternalError = "internal_error"
}

export function apiError(
  status: HttpStatus,
  code: ApiErrorCode,
  message: string,
  cors: Record<string, string> = {}
) {
  const cacheControl = status === HttpStatus.NotFound ? CACHE_CONTROL.notFound : CACHE_CONTROL.noStore;
  return json({ error: { code, message } }, cacheControl, cors, status);
}

/* A strong ETag: the base64url SHA-256 of the response body. */
export async function computeEtag(body: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return `"${base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}"`;
}

/* Weak comparison, as RFC 9110 defines for If-None-Match. */
export function matchesEtag(ifNoneMatch: string | null, etag: string) {
  if (!ifNoneMatch) return false;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, "");
  return ifNoneMatch.split(",").some((tag) => tag.trim() === "*" || opaque(tag) === opaque(etag));
}

/* A 200 JSON response with an ETag, or a 304 when the client copy is current. */
export async function conditionalJson(request: Request, data: unknown, cors: Record<string, string>) {
  const body = JSON.stringify(data);
  const etag = await computeEtag(body);
  const headers = { ...cors, "Cache-Control": CACHE_CONTROL.ok, ETag: etag };

  if (matchesEtag(request.headers.get("If-None-Match"), etag)) {
    return new Response(null, { status: HttpStatus.NotModified, headers });
  }
  return new Response(body, {
    status: HttpStatus.Ok,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}

function describeIssues(error: z.ZodError) {
  return error.issues
    .map((issue) =>
      issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message
    )
    .join("; ");
}

type HandlerContext = {
  request: Request;
  params?: Record<string, string>;
};

/*
  Wraps a public GET handler: validates query string and route params together,
  then adds the cache, ETag and CORS headers. Internal errors never reach the caller.
*/
export function publicGet<Schema extends z.ZodType>(
  schema: Schema,
  load: (input: z.infer<Schema>) => Promise<unknown>
) {
  return async ({ request, params }: HandlerContext) => {
    const cors = requestCorsHeaders(request);
    const query = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = schema.safeParse({ ...query, ...params });

    if (!parsed.success) {
      return apiError(HttpStatus.BadRequest, ApiErrorCode.InvalidRequest, describeIssues(parsed.error), cors);
    }

    try {
      return await conditionalJson(request, await load(parsed.data), cors);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return apiError(HttpStatus.NotFound, ApiErrorCode.NotFound, error.message, cors);
      }
      console.error("Public API request failed", request.url, error);
      return apiError(HttpStatus.InternalServerError, ApiErrorCode.InternalError, "Something went wrong.", cors);
    }
  };
}

export function publicPreflight({ request }: HandlerContext) {
  return new Response(null, { status: HttpStatus.NoContent, headers: requestCorsHeaders(request) });
}

function methodNotAllowed({ request }: HandlerContext) {
  const response = apiError(
    HttpStatus.MethodNotAllowed,
    ApiErrorCode.MethodNotAllowed,
    "This endpoint is read-only.",
    requestCorsHeaders(request)
  );
  response.headers.set("Allow", "GET, OPTIONS");
  return response;
}

/*
  Every handler a public route needs. Write methods get an explicit 405;
  otherwise they fall through to the app's HTML page.
*/
export function publicHandlers<Schema extends z.ZodType>(
  schema: Schema,
  load: (input: z.infer<Schema>) => Promise<unknown>
) {
  return {
    GET: publicGet(schema, load),
    OPTIONS: publicPreflight,
    POST: methodNotAllowed,
    PUT: methodNotAllowed,
    PATCH: methodNotAllowed,
    DELETE: methodNotAllowed
  };
}
