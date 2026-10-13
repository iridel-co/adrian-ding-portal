import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ContentListPage, EmptyState, FilterSelect } from "@/components/cms/content-list-page";
import { CrmReadState } from "@/components/crm/read-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { inquiriesQueryOptions } from "@/features/crm/queries";
import { inquiryListSchema } from "@/features/crm/schemas";
import { formatInquiryTime, inquiryStatusLabels, inquiryStatusOptions, isInquiryOverdue } from "@/features/crm/presentation";

const searchSchema = inquiryListSchema.pick({ status: true, search: true }).extend({
  offset: z.coerce.number().int().min(0).max(100000).catch(0).transform(offset => Math.floor(offset / 50) * 50)
});
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
  const inquiries = useQuery(inquiriesQueryOptions({ ...search, limit: 50 }));
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
        <TableHeader><TableRow><TableHead>Company / contact</TableHead><TableHead>Programme</TableHead><TableHead>Status</TableHead><TableHead>Received</TableHead><TableHead>First reply due</TableHead></TableRow></TableHeader>
        <TableBody>{inquiries.data.items.map(item => <TableRow key={item.id}>
          <TableCell className="whitespace-normal"><Link to="/inquiries/$id" params={{ id: item.id }} className="font-medium underline underline-offset-4">{item.company}</Link><p>{item.fullName}</p><p className="text-xs text-muted-foreground break-all">{item.email}</p></TableCell>
          <TableCell className="max-w-64 whitespace-normal">{item.program}</TableCell>
          <TableCell><Badge variant="secondary">{inquiryStatusLabels[item.status]}</Badge></TableCell>
          <TableCell>{formatInquiryTime(item.createdAt)}</TableCell>
          <TableCell>{formatInquiryTime(item.slaDueAt)}{isInquiryOverdue(item) && <p className="mt-1 font-medium text-destructive">Overdue</p>}</TableCell>
        </TableRow>)}</TableBody>
      </Table>}
      <div className="flex items-center justify-between gap-3"><Button variant="outline" disabled={search.offset === 0 || inquiries.isFetching} onClick={() => void navigate({ search: { ...search, offset: Math.max(0, search.offset - 50) } })}>Previous</Button>
        <p className="text-sm" aria-live="polite">Page {Math.floor(search.offset / 50) + 1}</p>
        <Button variant="outline" disabled={!inquiries.data.hasMore || inquiries.isFetching || search.offset >= 100000} onClick={() => void navigate({ search: { ...search, offset: search.offset + 50 } })}>Next</Button></div>
    </>}
  </ContentListPage>;
}
