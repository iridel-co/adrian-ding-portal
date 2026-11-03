import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";

import { ACTION_TONES, type ActionTone } from "@/components/quick-action";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableHead } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { errorMessage } from "@/features/shared/error-message";

/* Which rows on the current page are ticked. Rows that leave the page drop out on their own. */
export function useRowSelection<T extends { id: string }>(rows: T[]) {
  const [ids, setIds] = useState<string[]>([]);
  const selected = rows.filter((row) => ids.includes(row.id));
  return {
    selected,
    total: rows.length,
    isSelected: (id: string) => ids.includes(id),
    toggle: (id: string, checked: boolean) =>
      setIds((current) => (checked ? [...current, id] : current.filter((value) => value !== id))),
    selectAll: () => setIds(rows.map((row) => row.id)),
    clear: () => setIds([])
  };
}

type Selection = Pick<ReturnType<typeof useRowSelection>, "selected" | "total" | "selectAll" | "clear">;

/* The tick box in the header: ticks or clears every row on the page. */
export function SelectAllHead({ selection, label }: { selection: Selection; label: string }) {
  const count = selection.selected.length;
  return (
    <TableHead className="w-10">
      <Checkbox
        aria-label={label}
        disabled={selection.total === 0}
        checked={count > 0 && count === selection.total ? true : count > 0 ? "indeterminate" : false}
        onCheckedChange={(checked) => (checked === true ? selection.selectAll() : selection.clear())}
      />
    </TableHead>
  );
}

/* One row's tick box. It sits above the row's link, so ticking it doesn't open the row. */
export function SelectCell({ checked, onChange, label, disabled }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <TableCell className="relative z-10 w-10">
      <Checkbox aria-label={label} checked={checked} disabled={disabled} onCheckedChange={(value) => onChange(value === true)} />
    </TableCell>
  );
}

export function ActionsHead() {
  return <TableHead className="w-px text-right">Actions</TableHead>;
}

/* The last cell of a row, holding its quick actions. */
export function RowActions({ children }: { children: ReactNode }) {
  return (
    <TableCell className="relative z-10 w-px">
      <div className="flex justify-end gap-0.5">{children}</div>
    </TableCell>
  );
}

/* A small icon button for one row. A tooltip names it, and so does hidden text for screen readers. */
export function RowAction({ icon: Icon, label, tone = "default", className, ...props }: ComponentProps<typeof Button> & {
  icon: LucideIcon;
  label: string;
  tone?: ActionTone;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(ACTION_TONES[tone], className)}
          {...props}
        >
          <Icon />
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export const countOf = (count: number, noun: string, plural = `${noun}s`) => `${count} ${count === 1 ? noun : plural}`;

/*
  Runs one action on each picked row in turn, then sums it up in toasts:
  how many worked, and which ones didn't and why.
  ponytail: one request per row is fine for a page of rows; add a batch endpoint if it gets slow.
*/
export async function runBulk<T>(
  rows: T[],
  run: (row: T) => Promise<unknown>,
  describe: { name: (row: T) => string; done: (count: number) => string; message?: (error: unknown) => string }
) {
  const failures: string[] = [];
  for (const row of rows) {
    try {
      await run(row);
    } catch (error) {
      failures.push(`${describe.name(row)}: ${(describe.message ?? errorMessage)(error)}`);
    }
  }
  const succeeded = rows.length - failures.length;
  if (succeeded > 0) toast.success(describe.done(succeeded));
  if (failures.length > 0) toast.error(`${failures.length} couldn't be changed.`, { description: failures.join(" · ") });
}
