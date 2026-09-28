import "@tanstack/react-start/server-only";
import { createServerOnlyFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { relations } from "@/db/schema";
import { getEnv } from "@/lib/env";

function createDb() {
  const client = postgres(getEnv().DATABASE_URL, {
    max: 1,
    idle_timeout: 10,
    // Needed when connecting through a pooler like Cloudflare Hyperdrive
    prepare: false
  });
  return drizzle({ client, relations });
}

export type Db = ReturnType<typeof createDb>;

const dbByRequest = new WeakMap<Request, Db>();

/*
  One DB client per request. Cloudflare Workers don't allow a connection opened
  in one request to be reused in another, so a single global client breaks
  there. Scoping it to the request works the same on Workers, Vercel and Node.
*/
export const getDb = createServerOnlyFn(() => {
  const request = getRequest();
  let db = dbByRequest.get(request);
  if (!db) {
    db = createDb();
    dbByRequest.set(request, db);
  }
  return db;
});
