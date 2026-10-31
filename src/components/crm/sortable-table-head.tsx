import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ReactNode } from "react";
import { TableHead } from "@/components/ui/table";

export function SortableTableHead({ children, active, direction, onClick }: {
  children: ReactNode; active: boolean; direction: "asc" | "desc"; onClick: () => void;
}) {
  const Icon = active ? direction === "asc" ? ArrowUp : ArrowDown : ArrowUpDown;
  return <TableHead aria-sort={active ? direction === "asc" ? "ascending" : "descending" : "none"}>
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-2 rounded-sm py-2 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {children}<Icon aria-hidden="true" className="size-3.5 shrink-0" />
    </button>
  </TableHead>;
}
