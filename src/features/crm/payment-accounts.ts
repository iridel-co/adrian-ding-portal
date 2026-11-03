import "@tanstack/react-start/server-only";

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { media, paymentAccount } from "@/db/schema";
import { publicMediaUrl } from "@/features/media/r2";
import type { PortalActor } from "@/lib/access";
import { createdByValues, diffChanges, logActivity, updatedByValues } from "@/features/shared/audit";
import type { DbOrTx } from "@/features/shared/db-types";
import { CmsValidationError } from "@/features/shared/errors";
import type {
  createPaymentAccountInput,
  paymentAccountIdInput,
  paymentAccountListInput,
  updatePaymentAccountInput
} from "./payment-accounts-schemas";

const ENTITY_TYPE = "payment_account";
const QR_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_QR_BYTES = 1024 * 1024;

function assertAdmin(actor: PortalActor) {
  if (actor.role !== "admin") throw new CmsValidationError("Only portal admins can change payment accounts.");
}

async function getAccount(db: DbOrTx, id: string) {
  const [account] = await db.select().from(paymentAccount).where(eq(paymentAccount.id, id));
  if (!account) throw new CmsValidationError("This payment account no longer exists.");
  return account;
}

async function validateQr(db: DbOrTx, id: string) {
  const [qr] = await db.select().from(media).where(and(eq(media.id, id), isNull(media.archivedAt)));
  if (!qr || !QR_TYPES.includes(qr.contentType) || !qr.key || qr.sizeBytes <= 0 || qr.sizeBytes > MAX_QR_BYTES) {
    throw new CmsValidationError("Choose an active PNG, JPEG, or WebP QR image no larger than 1 MiB.");
  }
  return qr;
}

export async function listPaymentAccounts(db: DbOrTx, input: z.infer<typeof paymentAccountListInput>, fallbackId?: string) {
  const order = input.direction === "asc" ? asc : desc;
  const columns = {
    method: paymentAccount.method,
    providerName: paymentAccount.providerName,
    accountName: paymentAccount.accountName,
    isActive: paymentAccount.isActive
  };
  const rows = await db.select({
    id: paymentAccount.id,
    method: paymentAccount.method,
    providerName: paymentAccount.providerName,
    accountName: paymentAccount.accountName,
    accountNumber: paymentAccount.accountNumber,
    qrMediaId: paymentAccount.qrMediaId,
    isActive: paymentAccount.isActive,
    archivedAt: paymentAccount.archivedAt,
    qrUrl: media.key,
    qrAlt: media.alt,
    qrFileName: media.fileName
  }).from(paymentAccount).leftJoin(media, eq(media.id, paymentAccount.qrMediaId))
    .where(input.includeArchived ? undefined : isNull(paymentAccount.archivedAt))
    .orderBy(order(columns[input.sort]), asc(paymentAccount.position), asc(paymentAccount.providerName), desc(paymentAccount.id))
    .limit(input.limit + 1)
    .offset(input.offset);

  const databaseActiveId = rows.find((row) => row.isActive)?.id;
  const selectedId = databaseActiveId ?? fallbackId;
  return {
    items: rows.slice(0, input.limit).map((row) => ({ ...row, selectedForNewRegistrations: row.id === selectedId, qrUrl: row.qrUrl ? publicMediaUrl(row.qrUrl) : null })),
    hasMore: rows.length > input.limit
  };
}

async function accountValues(db: DbOrTx, data: Pick<z.infer<typeof createPaymentAccountInput>, "method" | "providerName" | "accountName" | "accountNumber" | "qrMediaId">) {
  await validateQr(db, data.qrMediaId);
  return { ...data, isActive: false };
}

export async function createPaymentAccount(db: DbOrTx, actor: PortalActor, data: z.infer<typeof createPaymentAccountInput>) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const [created] = await tx.insert(paymentAccount).values({ ...await accountValues(tx, data), ...createdByValues(actor.id) }).returning();
    await logActivity(tx, { userId: actor.id, action: "create", entityType: ENTITY_TYPE, entityId: created.id,
      changes: { providerName: { from: null, to: created.providerName }, method: { from: null, to: created.method } } });
    return created;
  });
}

export async function updatePaymentAccount(db: DbOrTx, actor: PortalActor, data: z.infer<typeof updatePaymentAccountInput>) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const before = await getAccount(tx, data.id);
    if (before.archivedAt) throw new CmsValidationError("Restore this account before editing it.");
    const { id: _id, ...fields } = data;
    const values = await accountValues(tx, fields);
    await tx.update(paymentAccount).set({ ...values, ...updatedByValues(actor.id) }).where(eq(paymentAccount.id, data.id));
    await logActivity(tx, { userId: actor.id, action: "update", entityType: ENTITY_TYPE, entityId: data.id,
      changes: diffChanges(before, { ...before, ...values }) });
  });
}

export async function activatePaymentAccount(db: DbOrTx, actor: PortalActor, data: z.infer<typeof paymentAccountIdInput>) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const target = await getAccount(tx, data.id);
    if (target.archivedAt) throw new CmsValidationError("Restore this account before activating it.");
    await validateQr(tx, target.qrMediaId ?? "");
    const previous = (await tx.select().from(paymentAccount).where(eq(paymentAccount.isActive, true)).for("update"))[0];
    await tx.update(paymentAccount).set({ isActive: false, ...updatedByValues(actor.id) }).where(eq(paymentAccount.isActive, true));
    await tx.update(paymentAccount).set({ isActive: true, ...updatedByValues(actor.id) }).where(eq(paymentAccount.id, data.id));
    if (previous && previous.id !== target.id) await logActivity(tx, { userId: actor.id, action: "status_change", entityType: ENTITY_TYPE, entityId: previous.id,
      changes: { isActive: { from: true, to: false } } });
    await logActivity(tx, { userId: actor.id, action: "status_change", entityType: ENTITY_TYPE, entityId: target.id,
      changes: { isActive: { from: target.isActive, to: true } } });
  });
}

export async function archivePaymentAccount(db: DbOrTx, actor: PortalActor, data: z.infer<typeof paymentAccountIdInput>, fallbackId?: string) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const before = await getAccount(tx, data.id);
    const [databaseActive] = await tx.select({ id: paymentAccount.id }).from(paymentAccount).where(eq(paymentAccount.isActive, true)).limit(1);
    if (before.isActive || (!databaseActive && before.id === fallbackId)) {
      throw new CmsValidationError("Activate a replacement before archiving the active account.");
    }
    await tx.update(paymentAccount).set({ archivedAt: new Date(), ...updatedByValues(actor.id) }).where(eq(paymentAccount.id, data.id));
    await logActivity(tx, { userId: actor.id, action: "archive", entityType: ENTITY_TYPE, entityId: data.id });
  });
}

export async function restorePaymentAccount(db: DbOrTx, actor: PortalActor, data: z.infer<typeof paymentAccountIdInput>) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const before = await getAccount(tx, data.id);
    await validateQr(tx, before.qrMediaId ?? "");
    await tx.update(paymentAccount).set({ archivedAt: null, isActive: false, ...updatedByValues(actor.id) }).where(eq(paymentAccount.id, data.id));
    await logActivity(tx, { userId: actor.id, action: "restore", entityType: ENTITY_TYPE, entityId: data.id });
  });
}
