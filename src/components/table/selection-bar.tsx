import type { ReactNode } from "react";

type SelectionBarProps = {
  count: number;
  total: number;
  onSelectAll: () => void;
  onClear: () => void;
  children: ReactNode;
};

/*
  A gray band on top of a table while rows are selected: how many are picked
  on the left, bulk actions on the right. Only render it when count > 0.
*/
export function SelectionBar({ count, total, onSelectAll, onClear, children }: SelectionBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-muted px-4 py-2">
      <p className="text-sm font-semibold">
        {count} of {total} selected
      </p>
      {count < total && (
        <button type="button" onClick={onSelectAll} className="text-sm font-medium text-brand hover:underline">
          Select all {total}
        </button>
      )}
      <button type="button" onClick={onClear} className="text-sm font-medium text-muted-foreground hover:text-foreground">
        Clear
      </button>
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </div>
  );
}
