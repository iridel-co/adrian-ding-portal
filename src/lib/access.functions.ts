import { createMiddleware } from "@tanstack/react-start";
import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { getDb } from "@/db";
import { AccessError, authorizePortalUser } from "./access";
import { authMiddleware } from "./auth.functions";
import { getEnv } from "./env";

export const staffMiddleware = createMiddleware().middleware([authMiddleware]).server(async ({ context, next }) => {
  setResponseHeader("Cache-Control", "no-store");
  let actor;
  try {
    const request = getRequest();
    const origin = request.headers.get("origin");
    const portalOrigin = new URL(getEnv().BETTER_AUTH_URL).origin;
    if (request.headers.get("sec-fetch-site") === "cross-site"
      || (origin !== null && origin !== portalOrigin)
      || (request.method !== "GET" && origin !== portalOrigin)) throw new AccessError(403, "origin_not_allowed");
    actor = await authorizePortalUser(getDb(), context.user.id, "staff");
  }
  catch (error) {
    setResponseStatus(error instanceof AccessError ? error.status : 503);
    throw new Error(error instanceof AccessError ? error.code : "access_unavailable");
  }
  return next({ context: { actor } });
});
