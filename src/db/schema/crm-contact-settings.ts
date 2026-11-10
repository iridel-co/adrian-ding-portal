import { sql } from "drizzle-orm";
import { check, pgTable, text } from "drizzle-orm/pg-core";
import { auditColumns } from "./columns";

export const CRM_CONTACT_SETTINGS_ID = "main";

export const crmContactSettings = pgTable("crm_contact_settings", {
  id: text("id").primaryKey().default(CRM_CONTACT_SETTINGS_ID),
  corporatePhone: text("corporate_phone").notNull(),
  corporateReplyTo: text("corporate_reply_to").notNull(),
  registrationReplyTo: text("registration_reply_to").notNull(),
  ...auditColumns()
}, table => [check("crm_contact_settings_singleton", sql`${table.id} = 'main'`)]);
