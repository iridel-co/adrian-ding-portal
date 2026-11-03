import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";

/*
  One card for a paged list: put the table (or its empty state) first and
  TablePagination last, so the page controls sit inside the card as its footer.
*/
export function TableCard({ children }: { children: ReactNode }) {
  return <Card className="gap-0 py-0">{children}</Card>;
}
