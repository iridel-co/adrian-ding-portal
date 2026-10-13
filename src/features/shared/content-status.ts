import type { contentStatus } from "@/db/schema";
import { CmsValidationError } from "@/features/shared/errors";

export type ContentStatus = (typeof contentStatus.enumValues)[number];


const ALLOWED_TRANSITIONS: Record<ContentStatus, ContentStatus[]> = {
  draft: ["published", "archived"],
  published: ["draft", "archived"],
  archived: ["draft"]
};

/* The status menu actions an editor offers for each status. */
export const CONTENT_STATUS_ACTIONS: Record<ContentStatus, { label: string; to: ContentStatus }[]> = {
  draft: [
    { label: "Publish", to: "published" },
    { label: "Archive", to: "archived" }
  ],
  published: [
    { label: "Unpublish (back to draft)", to: "draft" },
    { label: "Archive", to: "archived" }
  ],
  archived: [{ label: "Restore as draft", to: "draft" }]
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
