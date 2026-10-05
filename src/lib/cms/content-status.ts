import type { contentStatus } from "@/db/schema";
import { CmsValidationError } from "@/lib/cms/errors";

export type ContentStatus = (typeof contentStatus.enumValues)[number];


const ALLOWED_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  draft: ["published", "archived"],
  published: ["draft", "archived"],
  archived: ["draft"]
};

export function assertContentTransition(from: ContentStatus, to: ContentStatus) {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new CmsValidationError(`Can't change the status from ${from} to ${to}.`);
  }
}

/* The activity log action for a status change. */
export function contentStatusAction(from: ContentStatus, to: ContentStatus) {
  if (to === "archived") return "archive";
  if (from === "archived") return "restore";
  return "status_change";
}
