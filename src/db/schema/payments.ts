import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
  position: position(),
  archivedAt: timestamp("archived_at"),
  ...auditColumns()
});
