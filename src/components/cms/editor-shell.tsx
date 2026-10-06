import { ArrowLeft, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { StatusBadge, type StatusDisplay } from "@/components/cms/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export type StatusAction = {
  label: string;
  onSelect: () => void;
  isDestructive?: boolean;
};

type LastEdited = {
  name: string | null;
  at: Date | string;
};

type EditorShellProps = {
  title: string;
  back: ReactNode;
  status?: StatusDisplay;
  statusActions?: StatusAction[];
  isLive?: boolean;
  liveNote?: string;
  lastEdited?: LastEdited;
  isSaving: boolean;
  isDirty: boolean;
  onSave: () => void;
  aside?: ReactNode;
  children: ReactNode;
};

const DEFAULT_LIVE_NOTE = "This item is live. Changes show on the site when you save.";

export function EditorShell({
  title,
  back,
  status,
  statusActions = [],
  isLive = false,
  liveNote = DEFAULT_LIVE_NOTE,
  lastEdited,
  isSaving,
  isDirty,
  onSave,
  aside,
  children
}: EditorShellProps) {
  return (
    <form
      className="mx-auto flex max-w-6xl flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="flex flex-col gap-4">
        {back}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="font-display text-4xl break-words">{title || "Untitled"}</h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {status && <StatusBadge display={status} />}
              {lastEdited && (
                <span>
                  Last edited {lastEdited.name ? `by ${lastEdited.name} ` : ""}
                  {new Date(lastEdited.at).toLocaleString()}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            {statusActions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline">
                    Status
                    <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {statusActions.map((action) => (
                    <DropdownMenuItem
                      key={action.label}
                      variant={action.isDestructive ? "destructive" : "default"}
                      onSelect={action.onSelect}
                    >
                      {action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button type="submit" disabled={isSaving || !isDirty}>
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        {isLive && (
          <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
            {liveNote}
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
        {aside && <aside className="flex flex-col gap-6">{aside}</aside>}
      </div>
    </form>
  );
}

export function BackLink({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" />
      {children}
    </span>
  );
}
