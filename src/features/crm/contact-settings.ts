import "@tanstack/react-start/server-only";
import { eq, sql } from "drizzle-orm";
import { CRM_CONTACT_SETTINGS_ID, crmContactSettings } from "@/db/schema";
import type { DbOrTx } from "@/features/shared/db-types";
import { createdByValues, diffChanges, logActivity, updatedByValues } from "@/features/shared/audit";
import { AccessError, type PortalActor } from "@/lib/access";
import { AccessErrorCode } from "@/lib/access-errors";
import { crmContactSettingsSchema, type CrmContactValues } from "./contact-settings-schemas";

function assertAdmin(actor: PortalActor) {
  if (actor.role !== "admin") throw new AccessError(403, AccessErrorCode.AdminAccessRequired);
}

export async function readCrmContactOverrides(db: DbOrTx): Promise<Partial<CrmContactValues>> {
  const [saved] = await db.select({ corporatePhone: crmContactSettings.corporatePhone,
    corporateReplyTo: crmContactSettings.corporateReplyTo, registrationReplyTo: crmContactSettings.registrationReplyTo })
    .from(crmContactSettings).where(eq(crmContactSettings.id, CRM_CONTACT_SETTINGS_ID)).limit(1);
  return saved ?? {};
}

export async function getCrmContactSettings(db: DbOrTx, actor: PortalActor) {
  assertAdmin(actor);
  const overrides = await readCrmContactOverrides(db);
  return {
    values: { corporatePhone: process.env.CORPORATE_TEAM_PHONE ?? "", corporateReplyTo: process.env.CORPORATE_REPLY_TO ?? "",
      registrationReplyTo: process.env.REGISTRATION_REPLY_TO ?? "", ...overrides },
    isSaved: overrides.corporatePhone !== undefined
  };
}

export async function saveCrmContactSettings(db: DbOrTx, actor: PortalActor, input: CrmContactValues) {
  assertAdmin(actor);
  const values = crmContactSettingsSchema.parse(input);
  return db.transaction(async tx => {
    // Serialize the first save too, when there is no settings row to lock yet.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('crm_contact_settings'))`);
    const before = (await getCrmContactSettings(tx, actor)).values;
    await tx.insert(crmContactSettings).values({ id: CRM_CONTACT_SETTINGS_ID, ...values, ...createdByValues(actor.id) })
      .onConflictDoUpdate({ target: crmContactSettings.id, set: { ...values, ...updatedByValues(actor.id) } });
    await logActivity(tx, { userId: actor.id, action: "update", entityType: "crm_contact_settings", entityId: CRM_CONTACT_SETTINGS_ID,
      changes: diffChanges(before, values) });
    return { values, isSaved: true };
  });
}
