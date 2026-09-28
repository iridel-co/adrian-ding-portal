import "@tanstack/react-start/server-only";
import { createServerOnlyFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import * as schema from "@/db/schema";
import { isEmailAllowed } from "@/lib/allowed-emails";
import { getEnv } from "@/lib/env";

async function assertEmailAllowed(email: string | undefined | null) {
  if (!(await isEmailAllowed(email))) {
    throw new APIError("FORBIDDEN", { message: "This email is not allowed to sign in." });
  }
}

function createAuth() {
  const env = getEnv();
  const db = getDb();

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, { provider: "pg", schema }),

    // Send any auth error (e.g. a blocked email) back to the login page.
    onAPIError: {
      errorURL: "/login"
    },

    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        prompt: "select_account"
      }
    },

    // https://www.better-auth.com/docs/concepts/session-management#session-caching
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60
      }
    },

    /*
      Only allowed emails can sign in. We check on user creation (so strangers
      never get a user row) and on every new session (so removed users can't
      sign back in).
    */
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            await assertEmailAllowed(user.email);
          }
        }
      },
      session: {
        create: {
          before: async (session) => {
            const [row] = await db
              .select({ email: schema.user.email })
              .from(schema.user)
              .where(eq(schema.user.id, session.userId))
              .limit(1);
            await assertEmailAllowed(row?.email);
          }
        }
      }
    },

    telemetry: {
      enabled: false
    }
  });
}

const authByRequest = new WeakMap<Request, ReturnType<typeof createAuth>>();

/* Auth holds a DB client, so it's scoped per request too (see db/index.ts). */
export const getAuth = createServerOnlyFn(() => {
  const request = getRequest();
  let auth = authByRequest.get(request);
  if (!auth) {
    auth = createAuth();
    authByRequest.set(request, auth);
  }
  return auth;
});
