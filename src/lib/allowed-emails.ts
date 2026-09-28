import "@tanstack/react-start/server-only";
import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { allowedEmail } from "@/db/schema";
import { getEnv } from "@/lib/env";

/* An email can sign in if it's in ADMIN_EMAILS or in the allowed_email table. */
export async function isEmailAllowed(email: string | undefined | null) {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();

  if (getEnv().ADMIN_EMAILS.includes(normalized)) return true;

  const [row] = await getDb()
    .select({ email: allowedEmail.email })
    .from(allowedEmail)
    .where(eq(allowedEmail.email, normalized))
    .limit(1);

  return Boolean(row);
}
