import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { crmPageSizes } from "@/features/crm/pagination";

type CrmTablePaginationProps = {
  limit: number; offset: number; count: number; hasMore: boolean; fetching: boolean;
  onChange: (page: { limit: number; offset: number }) => void;
};

export function CrmTablePagination({ limit, offset, count, hasMore, fetching, onChange }: CrmTablePaginationProps) {
  return <nav aria-label="Table pagination" className="flex flex-wrap items-center justify-end gap-3 border-t pt-4 text-sm">
    <span className="text-muted-foreground">Rows per page:</span>
    <Select value={String(limit)} disabled={fetching} onValueChange={value => {
      const size = crmPageSizes.find(size => String(size) === value);
      if (size) onChange({ limit: size, offset: 0 });
    }}>
      <SelectTrigger aria-label="Rows per page" className="w-20" size="sm"><SelectValue /></SelectTrigger>
      <SelectContent>{crmPageSizes.map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent>
    </Select>
    <p className="min-w-20 text-center tabular-nums text-muted-foreground" aria-live="polite" aria-label={`Page ${Math.floor(offset / limit) + 1}`}>
      {count ? `${offset + 1}–${offset + count}` : "0 results"}
    </p>
    <div className="flex gap-1">
      <Button size="icon" variant="ghost" aria-label="Previous page" disabled={!offset || fetching}
        onClick={() => onChange({ limit, offset: Math.max(0, offset - limit) })}><ChevronLeft className="size-4" /></Button>
      <Button size="icon" variant="ghost" aria-label="Next page" disabled={!hasMore || fetching || offset + limit > 100000}
        onClick={() => onChange({ limit, offset: offset + limit })}><ChevronRight className="size-4" /></Button>
    </div>
  </nav>;
}
