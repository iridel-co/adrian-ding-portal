import "@tanstack/react-start/server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { account, user } from "@/db/schema";
import { AccessErrorCode } from "./access-errors";

export type PortalRole = "staff" | "admin";
export type PortalActor = { id: string; name: string; email: string; role: PortalRole };

export class AccessError extends Error {
  constructor(public status: number, public code: AccessErrorCode) { super(code); }
}

export function emailList(value = "") {
  return value.split(",").map(email => email.trim().toLowerCase()).filter(Boolean);
}

export function portalRole(email: string, adminEmails: string, staffEmails: string): PortalRole | null {
  const normalized = email.trim().toLowerCase();
  if (emailList(adminEmails).includes(normalized)) return "admin";
  return emailList(staffEmails).includes(normalized) ? "staff" : null;
}

export async function authorizePortalUser(db: Db, userId: string | undefined, required: PortalRole): Promise<PortalActor> {
  if (!userId) throw new AccessError(401, AccessErrorCode.AuthenticationRequired);
  // Read verified identity and current role assignments, rather than cached cookie fields.
  const [actor] = await db.select({ id: user.id, name: user.name, email: user.email, emailVerified: user.emailVerified })
    .from(user).innerJoin(account, and(eq(account.userId, user.id), eq(account.providerId, "google")))
    .where(eq(user.id, userId)).limit(1);
  const role = actor?.emailVerified ? portalRole(actor.email, process.env.ADMIN_EMAILS ?? "", process.env.STAFF_EMAILS ?? "") : null;
  if (!actor || !role || (required === "admin" && role !== "admin")) throw new AccessError(403, required === "admin" ? AccessErrorCode.AdminAccessRequired : AccessErrorCode.StaffAccessRequired);
  return { id: actor.id, name: actor.name, email: actor.email.trim().toLowerCase(), role };
}
