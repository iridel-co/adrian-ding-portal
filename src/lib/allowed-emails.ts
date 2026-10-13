import "@tanstack/react-start/server-only";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { allowedEmail } from "@/db/schema";
import { getEnv } from "@/lib/env";

/* Include inquiry staff in sign-in; CRM roles are checked separately on CRM requests. */
export async function isEmailAllowed(email: string | undefined | null) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();

  const env = getEnv();
  if (env.ADMIN_EMAILS.includes(normalized) || env.STAFF_EMAILS.includes(normalized)) return true;

  const [row] = await getDb()
    .select({ email: allowedEmail.email })
    .from(allowedEmail)
    .where(eq(allowedEmail.email, normalized))
    .limit(1);

  return Boolean(row);
}
