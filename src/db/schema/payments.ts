import { sql } from "drizzle-orm";
import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { auditColumns, position } from "./columns";
import { media } from "./media";

export const paymentMethod = pgEnum("payment_method", ["bank", "gcash", "maya"]);

/* An account that registrants pay into. Shown in payment instructions. */
export const paymentAccount = pgTable("payment_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  method: paymentMethod("method").notNull(),
  providerName: text("provider_name").notNull(),
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number").notNull(),
  qrMediaId: uuid("qr_media_id").references(() => media.id, { onDelete: "restrict" }),
  isActive: boolean("is_active").default(false).notNull(),
  position: position(),
  archivedAt: timestamp("archived_at"),
  ...auditColumns()
}, (table) => [
  uniqueIndex("payment_account_one_active_idx").on(table.isActive).where(sql`${table.isActive} = true`)
]);
