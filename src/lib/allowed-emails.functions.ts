import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { allowedEmail, session, user } from "@/db/schema";
import { authMiddleware } from "@/lib/auth.functions";
import { getEnv } from "@/lib/env";

const emailInput = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: "Enter a valid email." }))
});

export const $listAllowedEmails = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async () => {
    const rows = await getDb().select().from(allowedEmail).orderBy(asc(allowedEmail.createdAt));
    return { adminEmails: getEnv().ADMIN_EMAILS, emails: rows };
  });

export const $addAllowedEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(emailInput)
  .handler(async ({ data }) => {
    await getDb().insert(allowedEmail).values({ email: data.email }).onConflictDoNothing();
  });

export const $removeAllowedEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(emailInput)
  .handler(async ({ data, context }) => {
    if (data.email === context.user.email.toLowerCase()) {
      throw new Error("You can't remove your own email.");
    }

    const db = getDb();
    await db.delete(allowedEmail).where(eq(allowedEmail.email, data.email));

    // Sign the removed user out everywhere
    await db
      .delete(session)
      .where(
        inArray(session.userId, db.select({ id: user.id }).from(user).where(eq(user.email, data.email)))
      );
  });

export const allowedEmailsQueryOptions = () =>
  queryOptions({
    queryKey: ["allowed-emails"],
    queryFn: () => $listAllowedEmails()
  });
