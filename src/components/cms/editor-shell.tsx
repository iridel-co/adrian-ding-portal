import { cn } from "cn";
import { ArrowLeft, CircleDot, Save, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { FormErrorList } from "@/components/cms/form-section";
import { StatusBadge, type StatusDisplay } from "@/components/cms/status-badge";
import { DetailHeader, Fact } from "@/components/crm/detail-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export type StatusAction = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  isDestructive?: boolean;
};

type EditorShellProps = {
  title: string;
  back: ReactNode;
  status?: StatusDisplay;
  statusActions?: StatusAction[];
  isLive?: boolean;
  liveNote?: string;
  isSaving: boolean;
  isDirty: boolean;
  errors?: string[];
  onSave: () => void;
  preview?: ReactNode;
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
  isSaving,
  isDirty,
  errors = [],
  onSave,
  preview,
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
      {/*
        The same header as the other detail pages. Each status change is its own
        button (e.g. Publish, Archive), next to an icon-only Preview and Save.
      */}
      <div className="flex flex-col gap-4">
        <DetailHeader
          crumb={back}
          title={title || "Untitled"}
          facts={status && <Fact icon={CircleDot} label="Status"><StatusBadge display={status} /></Fact>}
          actions={<>
            {preview}
            {statusActions.map((action) => (
              <Button
                key={action.label}
                type="button"
                variant="outline"
                className={cn(action.isDestructive && "text-destructive hover:bg-destructive/10 hover:text-destructive")}
                onClick={action.onSelect}
              >
                <action.icon data-icon="inline-start" />
                {action.label}
              </Button>
            ))}
            <Button type="submit" variant="brand" disabled={isSaving || !isDirty}>
              <Save data-icon="inline-start" />
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </>}
        />
        {isLive && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-100 px-3.5 py-2.5 text-sm font-medium text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/15 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>{liveNote}</p>
          </div>
        )}
        <FormErrorList messages={errors} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
        {aside && <aside className="flex flex-col gap-6">{aside}</aside>}
      </div>
    </form>
  );
}

function placeholders(count: number) {
  return Array.from({ length: count }, (_, index) => index);
}

function FormSectionSkeleton({ fields }: { fields: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {placeholders(fields).map((field) => (
          <div key={field} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* The editor layout with placeholder fields, shown while the record loads. */
export function EditorSkeleton() {
  return (
    <div role="status" aria-label="Loading editor…" className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-28" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-10 w-72 max-w-full" />
            <Skeleton className="h-5 w-48" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-16" />
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <FormSectionSkeleton fields={4} />
          <FormSectionSkeleton fields={3} />
        </div>
        <FormSectionSkeleton fields={2} />
      </div>
    </div>
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
