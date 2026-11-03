import { cn } from "cn";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { TableHead } from "@/components/ui/table";

/* The sorted column shows its arrow in brand red. Other columns show a faint arrow that darkens on hover. */
export function SortableTableHead({ children, active, direction, onClick, className }: {
  children: ReactNode; active: boolean; direction: "asc" | "desc"; onClick: () => void; className?: string;
}) {
  const Icon = active ? direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <TableHead className={className} aria-sort={active ? direction === "asc" ? "ascending" : "descending" : "none"}>
    <button type="button" onClick={onClick}
      className={cn("group/sort inline-flex items-center gap-1.5 rounded-sm py-2 text-left uppercase hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "text-foreground")}>
      {children}<Icon aria-hidden="true" className={cn("size-3.5 shrink-0", active ? "text-brand" : "opacity-40 group-hover/sort:opacity-100")} />
    </button>
  </TableHead>;
}
