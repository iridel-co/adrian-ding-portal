import "@tanstack/react-start/server-only";
import { and, asc, eq } from "drizzle-orm";

import { faq, type faqGroup } from "@/db/schema";
import type { DbOrTx } from "@/features/shared/db-types";
import { isPublished } from "@/features/shared/visibility";

type FaqGroup = (typeof faqGroup.enumValues)[number];

export async function listPublicFaqs(db: DbOrTx, filters: { group?: FaqGroup }) {
  return db
    .select({ id: faq.id, group: faq.group, question: faq.question, answer: faq.answer })
    .from(faq)
    .where(and(isPublished(faq.status), filters.group ? eq(faq.group, filters.group) : undefined))
    .orderBy(asc(faq.group), asc(faq.position), asc(faq.createdAt));
}
