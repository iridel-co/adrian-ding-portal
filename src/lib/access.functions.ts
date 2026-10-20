import { createMiddleware } from "@tanstack/react-start";
import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { getDb } from "@/db";
import { AccessError, authorizePortalUser } from "./access";
import { AccessErrorCode } from "./access-errors";
import { authMiddleware } from "./auth.functions";
import { getEnv } from "./env";

export const staffMiddleware = createMiddleware().middleware([authMiddleware]).server(async ({ context, next }) => {
  setResponseHeader("Cache-Control", "no-store");
  let actor;
  try {
    const request = getRequest();
    const origin = request.headers.get("origin");
    const portalOrigin = new URL(getEnv().BETTER_AUTH_URL).origin;
    // Post-login document GETs can carry cors mode; cross-site RPC calls remain blocked.
    const pageNavigation = request.method === "GET" && request.headers.get("sec-fetch-dest") === "document"
      && !request.headers.has("x-tsr-serverFn");
    if ((request.headers.get("sec-fetch-site") === "cross-site" && !pageNavigation)
      || (origin !== null && origin !== portalOrigin)
      || (request.method !== "GET" && origin !== portalOrigin)) throw new AccessError(403, AccessErrorCode.OriginNotAllowed);
    actor = await authorizePortalUser(getDb(), context.user.id, "staff");
  }
  catch (error) {
    setResponseStatus(error instanceof AccessError ? error.status : 503);
    throw new Error(error instanceof AccessError ? error.code : AccessErrorCode.AccessUnavailable);
  }
  return next({ context: { actor } });
});
