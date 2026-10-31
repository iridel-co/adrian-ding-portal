import { SortableTableHead } from "@/components/crm/sortable-table-head";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ContentListPage, EmptyState, FilterSelect } from "@/components/cms/content-list-page";
import { CrmTablePagination } from "@/components/crm/table-pagination";
import { CrmReadState } from "@/components/crm/read-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { inquiriesQueryOptions } from "@/features/crm/queries";
import { inquirySearchSchema as searchSchema } from "@/features/crm/inquiry-navigation";
import { formatCrmTime, inquiryStatusLabels, inquiryStatusOptions, isInquiryOverdue } from "@/features/crm/presentation";

export const Route = createFileRoute("/_app/inquiries/")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Corporate inquiries" }] }),
  component: InquiriesPage
});

function InquiriesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [text, setText] = useState(search.search);
  useEffect(() => setText(search.search), [search.search]);
  const inquiries = useQuery(inquiriesQueryOptions(search));
  return <ContentListPage title="Corporate inquiries" description="Record replies, proposals and outcomes. All times are in Manila."
    action={<Button variant="outline" onClick={() => void inquiries.refetch()} disabled={inquiries.isFetching}>Refresh</Button>}
    filters={<>
      <form className="flex gap-2" onSubmit={event => { event.preventDefault(); void navigate({ search: { ...search, search: text, offset: 0 } }); }}>
        <Input aria-label="Search inquiries by company, name or email" placeholder="Company, name or email" maxLength={200} value={text} onChange={event => setText(event.target.value)} />
        <Button variant="outline" type="submit">Search</Button>
      </form>
      <FilterSelect label="Inquiry status" options={inquiryStatusOptions} value={search.status}
        onChange={status => void navigate({ search: { ...search, status, offset: 0 } })} />
    </>}>
    <CrmReadState pending={inquiries.isPending} error={inquiries.error} retry={() => void inquiries.refetch()} />
    {!inquiries.isError && inquiries.data && <>
      {inquiries.data.items.length === 0 ? <EmptyState>No inquiries match these filters.</EmptyState> : <Table>
        <TableHeader><TableRow>{([["company", "Company / contact"], ["program", "Programme"], ["status", "Status"], ["createdAt", "Received"], ["slaDueAt", "First reply due"]] as const).map(([key, label]) =>
            <SortableTableHead key={key} active={search.sort === key} direction={search.direction}
              onClick={() => void navigate({ search: { ...search, sort: key,
                direction: search.sort === key && search.direction === "asc" ? "desc" : "asc", offset: 0 } })}>{label}</SortableTableHead>
          )}</TableRow></TableHeader>
        <TableBody>{inquiries.data.items.map(item => <TableRow key={item.id}>
          <TableCell className="whitespace-normal"><Link to="/inquiries/$id" params={{ id: item.id }} search={search} className="font-medium underline underline-offset-4">{item.company}</Link><p>{item.fullName}</p><p className="text-xs text-muted-foreground break-all">{item.email}</p></TableCell>
          <TableCell className="max-w-64 whitespace-normal">{item.program}</TableCell>
          <TableCell><Badge variant="secondary">{inquiryStatusLabels[item.status]}</Badge></TableCell>
          <TableCell>{formatCrmTime(item.createdAt)}</TableCell>
          <TableCell>{formatCrmTime(item.slaDueAt)}{isInquiryOverdue(item) && <p className="mt-1 font-medium text-destructive">Overdue</p>}</TableCell>
        </TableRow>)}</TableBody>
      </Table>}
      <CrmTablePagination limit={search.limit} offset={search.offset} count={inquiries.data.items.length}
        hasMore={inquiries.data.hasMore} fetching={inquiries.isFetching}
        onChange={page => void navigate({ search: { ...search, ...page } })} />
    </>}
  </ContentListPage>;
}
