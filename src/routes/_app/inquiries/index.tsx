import { SortableTableHead } from "@/components/table/sortable-table-head";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { InquiryStatus } from "@/features/crm/lifecycle";
import { MessagesSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { ContentListPage, EmptyState, FilterSelect, SearchInput } from "@/components/cms/content-list-page";
import { TablePagination } from "@/components/table/table-pagination";
import { TableCard } from "@/components/table/table-card";
import { ActionsHead, RowActions, SelectAllHead, SelectCell, useRowSelection } from "@/components/table/row-actions";
import { SelectionBar } from "@/components/table/selection-bar";
import { InquiryActions, type InquiryDraft } from "@/components/crm/inquiry-actions";
import { InquiryBulkActions } from "@/components/crm/inquiry-bulk-actions";
import { CrmReadState } from "@/components/crm/read-state";
import { TableSkeleton } from "@/components/table/table-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgramChip } from "@/components/crm/program-chip";
import { Table, TableBody, TableCell, TableHeader, TableRow, tableRowLinkClass } from "@/components/ui/table";
import { inquiriesQueryOptions } from "@/features/crm/queries";
import { inquirySearchSchema as searchSchema } from "@/features/crm/inquiry-navigation";
import { formatCrmTime, inquiryStatusLabels, inquiryStatusOptions, inquiryStatusVariants, isInquiryOverdue } from "@/features/crm/presentation";

export const Route = createFileRoute("/_app/inquiries/")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Corporate inquiries" }] }),
  component: InquiriesPage
});

const columns = [["company", "Company / contact"], ["program", "Programme"], ["status", "Status"], ["createdAt", "Received"], ["slaDueAt", "First reply due"]] as const;

function InquiriesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [text, setText] = useState(search.search);
  useEffect(() => setText(search.search), [search.search]);
  const inquiries = useQuery(inquiriesQueryOptions(search));
  const selection = useRowSelection(inquiries.data?.items ?? []);
  return <ContentListPage title="Corporate inquiries" description="Record replies, proposals and outcomes. All times are in Manila."
    action={<Button variant="outline" onClick={() => void inquiries.refetch()} disabled={inquiries.isFetching}>Refresh</Button>}
    filters={<>
      <form onSubmit={event => { event.preventDefault(); void navigate({ search: { ...search, search: text, offset: 0 } }); }}>
        <SearchInput aria-label="Search inquiries by company, name or email" placeholder="Company, name or email" maxLength={200} value={text} onChange={event => setText(event.target.value)} />
      </form>
      <FilterSelect label="Inquiry status" options={inquiryStatusOptions} value={search.status}
        onChange={status => void navigate({ search: { ...search, status, offset: 0 } })} />
    </>}>
    <CrmReadState pending={inquiries.isPending} error={inquiries.error} retry={() => void inquiries.refetch()}
      skeleton={<TableSkeleton columns={columns.map(([, label]) => ({ label }))} />} />
    {!inquiries.isError && inquiries.data && <TableCard>
      {selection.selected.length > 0 && <SelectionBar count={selection.selected.length} total={selection.total} onSelectAll={selection.selectAll} onClear={selection.clear}>
        <InquiryBulkActions items={selection.selected} onDone={selection.clear} />
      </SelectionBar>}
      {inquiries.data.items.length === 0 ? <EmptyState icon={MessagesSquare}>No inquiries match these filters.</EmptyState> : <Table>
        <TableHeader><TableRow><SelectAllHead selection={selection} label="Select all inquiries on this page" />{columns.map(([key, label]) =>
            <SortableTableHead key={key} active={search.sort === key} direction={search.direction}
              onClick={() => void navigate({ search: { ...search, sort: key,
                direction: search.sort === key && search.direction === "asc" ? "desc" : "asc", offset: 0 } })}>{label}</SortableTableHead>
          )}<ActionsHead /></TableRow></TableHeader>
        <TableBody>{inquiries.data.items.map(item => <TableRow key={item.id} data-state={selection.isSelected(item.id) ? "selected" : undefined}>
          <SelectCell checked={selection.isSelected(item.id)} onChange={checked => selection.toggle(item.id, checked)} label={`Select ${item.company}`} />
          <TableCell className="whitespace-normal"><Link to="/inquiries/$id" params={{ id: item.id }} search={search} className={tableRowLinkClass}>{item.company}</Link><p className="mt-0.5 text-muted-foreground">{item.fullName}</p><p className="text-xs text-muted-foreground break-all">{item.email}</p></TableCell>
          <TableCell className="max-w-64 whitespace-normal"><ProgramChip program={item.program} /></TableCell>
          <TableCell><Badge variant={inquiryStatusVariants[item.status]}>{inquiryStatusLabels[item.status]}</Badge></TableCell>
          <TableCell>{formatCrmTime(item.createdAt)}</TableCell>
          <TableCell>{formatCrmTime(item.slaDueAt)}{isInquiryOverdue(item) && <Badge variant="destructive" className="mt-1 flex">Overdue</Badge>}</TableCell>
          <RowActions><InquiryRowActions inquiry={item} /></RowActions>
        </TableRow>)}</TableBody>
      </Table>}
      <TablePagination limit={search.limit} offset={search.offset} count={inquiries.data.items.length}
        hasMore={inquiries.data.hasMore} fetching={inquiries.isFetching}
        onChange={page => void navigate({ search: { ...search, ...page } })} />
    </TableCard>}
  </ContentListPage>;
}

/* Each row keeps its own draft, so a half-filled dialog survives a list refresh. */
function InquiryRowActions({ inquiry }: { inquiry: { id: string; status: InquiryStatus } }) {
  const [draft, setDraft] = useState<InquiryDraft>({ selected: null, expectedStatus: inquiry.status, value: null, reason: "", validation: "" });
  return <InquiryActions inquiry={inquiry} draft={draft} setDraft={setDraft} compact />;
}
