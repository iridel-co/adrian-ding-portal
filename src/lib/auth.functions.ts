import { createMiddleware, createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";

import { getAuth } from "@/lib/auth";
import { AccessErrorCode } from "./access-errors";

type GetUserQuery = {
  disableCookieCache?: boolean;
};

/* Reads the current user from the request cookies. Server only. */
const _getUser = createServerOnlyFn(async (query?: GetUserQuery) => {
  const session = await getAuth().api.getSession({
    headers: getRequest().headers,
    query,
    returnHeaders: true
  });

  // Forward any Set-Cookie headers, e.g. for session/cache refresh
  const cookies = session.headers?.getSetCookie();
  if (cookies?.length) {
    setResponseHeader("Set-Cookie", cookies);
  }

  return session.response?.user ?? null;
});

/* Used by getAuthUserQueryOptions() to guard routes. */
export const $getUser = createServerFn({ method: "GET" }).handler(() => _getUser());

/*
  Use on server functions that need a signed-in user. Skips the cookie cache
  so a removed user is blocked right away. Adds `user` to the context.
*/
export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const user = await _getUser({ disableCookieCache: true });

  if (!user) {
    setResponseStatus(401);
    throw new Error(AccessErrorCode.Unauthorized);
  }

  return next({ context: { user } });
});
