import { Archive, ArchiveRestore, EyeOff, Globe, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { QuickAction } from "@/components/quick-action";
import { countOf, RowAction, runBulk } from "@/components/table/row-actions";
import type { ContentStatus } from "@/features/shared/content-status";

type ContentItem = { id: string; title: string; status: ContentStatus };
type ContentActionsProps = {
  noun: string;
  setStatus: (id: string, status: ContentStatus) => Promise<unknown>;
  onDone: () => void;
};
type ContentAction = { label: string; done: string; icon: LucideIcon; from: ContentStatus[]; to: ContentStatus; tone?: "destructive" };

/* The status changes a list offers. They match the editor's status menu. */
const CONTENT_ACTIONS: ContentAction[] = [
  { label: "Publish", done: "Published", icon: Globe, from: ["draft"], to: "published" },
  { label: "Unpublish", done: "Unpublished", icon: EyeOff, from: ["published"], to: "draft" },
  { label: "Archive", done: "Archived", icon: Archive, from: ["draft", "published"], to: "archived", tone: "destructive" },
  { label: "Restore", done: "Restored", icon: ArchiveRestore, from: ["archived"], to: "draft" }
];

function useStatusChange({ noun, setStatus, onDone }: ContentActionsProps) {
  const [isBusy, setIsBusy] = useState(false);
  const apply = async (action: ContentAction, items: ContentItem[]) => {
    setIsBusy(true);
    await runBulk(items, (item) => setStatus(item.id, action.to), {
      name: (item) => item.title,
      done: (count) => `${action.done} ${countOf(count, noun)}.`
    });
    setIsBusy(false);
    onDone();
  };
  return { isBusy, apply };
}

/*
  Bulk buttons for the selection bar. Only actions that fit at least one ticked
  row show up, and each runs only on the rows it fits ("Publish 2" means two of them).
*/
export function ContentBulkActions({ items, ...props }: ContentActionsProps & { items: ContentItem[] }) {
  const { isBusy, apply } = useStatusChange(props);
  return CONTENT_ACTIONS.map((action) => {
    const fits = items.filter((item) => action.from.includes(item.status));
    if (fits.length === 0) return null;
    return (
      <QuickAction key={action.label} icon={action.icon} tone={action.tone} disabled={isBusy} onClick={() => void apply(action, fits)}>
        {fits.length < items.length ? `${action.label} ${fits.length}` : action.label}
      </QuickAction>
    );
  });
}

/* Icon buttons for the status changes one row allows. */
export function ContentRowActions({ item, ...props }: ContentActionsProps & { item: ContentItem }) {
  const { isBusy, apply } = useStatusChange(props);
  return CONTENT_ACTIONS.filter((action) => action.from.includes(item.status)).map((action) => (
    <RowAction key={action.label} icon={action.icon} label={action.label} tone={action.tone} disabled={isBusy}
      onClick={() => void apply(action, [item])} />
  ));
}
