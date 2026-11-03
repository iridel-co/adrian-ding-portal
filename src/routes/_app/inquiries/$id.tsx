import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, Ban, BriefcaseBusiness, CalendarClock, CalendarDays, ChevronRight, CircleDot, CircleX, ClipboardList, Contact,
  FileText, Flag, GraduationCap, HistoryIcon, Inbox, Mail, MailCheck, MapPin, MessageSquareText, Phone, Presentation,
  RefreshCw, RotateCw, Sparkles, Trophy, UserRound, Users, Wallet, type LucideIcon
} from "lucide-react";
import { useState } from "react";
import { CrmReadState } from "@/components/crm/read-state";
import { DetailSkeleton } from "@/components/table/detail-skeleton";
import { DetailHeader, Fact, InfoCard, InfoList, InfoRow, TimelineItem, type TimelineTone } from "@/components/crm/detail-parts";
import { InquiryActions, type InquiryDraft } from "@/components/crm/inquiry-actions";
import { InquiryEmails } from "@/components/crm/inquiry-emails";
import { ProgramChip } from "@/components/crm/program-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { inquirySearchSchema } from "@/features/crm/inquiry-navigation";
import type { InquiryStatus } from "@/features/crm/lifecycle";
import { inquiryQueryOptions } from "@/features/crm/queries";
import { formatCrmTime, inquiryStatusLabels, inquiryStatusVariants, isInquiryOverdue } from "@/features/crm/presentation";
import { formatDate, formatDateRange } from "@/features/shared/format";
import { formatPesos } from "@/features/shared/money";
import type { $getInquiry } from "@/features/crm/functions";

export const Route = createFileRoute("/_app/inquiries/$id")({
  validateSearch: inquirySearchSchema,
  head: () => ({ meta: [{ title: "Corporate inquiry" }] }),
  component: InquiryPage
});

/* Both tabs stay in the page so nothing is lost on a refresh; the closed one is hidden. */
const TAB_PANEL = "data-[state=inactive]:hidden";

function InquiryPage() {
  const { id } = Route.useParams();
  return <InquiryDetail key={id} id={id} />;
}

function InquiryDetail({ id }: { id: string }) {
  const search = Route.useSearch();
  const [offset, setOffset] = useState(0);
  // Keep entered values if a failed refresh temporarily hides the detail panels.
  const [draft, setDraft] = useState<InquiryDraft>({ selected: null, expectedStatus: "NEW", value: null, reason: "", validation: "" });
  const result = useQuery(inquiryQueryOptions(id, offset));
  const inquiry = result.data;
  const crumb = <Link to="/inquiries" search={search} className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
    Corporate inquiries<ChevronRight className="size-4" />
  </Link>;

  if (result.isError || !inquiry) return <div className="mx-auto flex max-w-6xl flex-col gap-6">
    {crumb}
    <CrmReadState pending={result.isPending} error={result.error} retry={() => void result.refetch()}
      loadingMessage="Loading inquiry…" skeleton={<DetailSkeleton />} />
  </div>;

  const overdue = isInquiryOverdue(inquiry);
  const targetDates = inquiry.targetDateFrom
    ? inquiry.targetDateTo ? formatDateRange(inquiry.targetDateFrom, inquiry.targetDateTo) : formatDate(inquiry.targetDateFrom)
    : inquiry.targetDateText || "Not specified";

  return <div className="mx-auto flex max-w-6xl flex-col gap-6">
    <DetailHeader
      crumb={crumb}
      title={inquiry.company}
      subtitle={<><UserRound />{inquiry.fullName}{inquiry.role && <><span aria-hidden="true">·</span>{inquiry.role}</>}</>}
      facts={<>
        <Fact icon={CircleDot} label="Status">
          <Badge variant={inquiryStatusVariants[inquiry.status]}>{inquiryStatusLabels[inquiry.status]}</Badge>
          {overdue && <Badge variant="destructive">First reply overdue</Badge>}
        </Fact>
        <Fact icon={Presentation} label="Programme"><ProgramChip program={inquiry.program} /></Fact>
        <Fact icon={Inbox} label="Received">{formatCrmTime(inquiry.createdAt)}</Fact>
        {inquiry.contactedAt
          ? <Fact icon={MailCheck} label="First reply">{formatCrmTime(inquiry.contactedAt)}</Fact>
          : <Fact icon={CalendarClock} label="First reply due"><span className={overdue ? "text-destructive" : undefined}>{formatCrmTime(inquiry.slaDueAt)}</span></Fact>}
        {inquiry.estimatedValueCentavos !== null && <Fact icon={Wallet} label="Proposal value">
          <span className="text-emerald-700 dark:text-emerald-400">{formatPesos(inquiry.estimatedValueCentavos)}</span>
          {inquiry.proposalSentAt && <span className="font-normal text-muted-foreground">sent {formatCrmTime(inquiry.proposalSentAt)}</span>}
        </Fact>}
        {inquiry.closedAt && <Fact icon={Flag} label="Closed">{formatCrmTime(inquiry.closedAt)}</Fact>}
        {inquiry.lostReason && <Fact icon={CircleX} label="Loss reason"><span className="font-normal whitespace-pre-wrap break-words">{inquiry.lostReason}</span></Fact>}
      </>}
      actions={<>
        <InquiryActions inquiry={inquiry} draft={draft} setDraft={setDraft} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" disabled={result.isFetching} onClick={() => void result.refetch()}><RefreshCw /><span className="sr-only">Refresh</span></Button>
          </TooltipTrigger>
          <TooltipContent>Refresh</TooltipContent>
        </Tooltip>
      </>}
    />

    <Tabs defaultValue="details" className="gap-3">
      <TabsList aria-label="Inquiry sections">
        <TabsTrigger value="details"><ClipboardList />Details</TabsTrigger>
        <TabsTrigger value="history">
          <HistoryIcon />History & Emails
          <span className="rounded-full bg-current/15 px-1.5 text-xs tabular-nums">{inquiry.history.length + inquiry.emailJobs.length}{inquiry.historyHasMore ? "+" : ""}</span>
        </TabsTrigger>
      </TabsList>
      <p className="text-xs text-muted-foreground">All times are in Manila. The first reply is due two weekdays after the inquiry arrives.</p>

      <TabsContent value="details" forceMount className={TAB_PANEL}>
        <div className="mt-3 grid items-start gap-6 lg:grid-cols-2">
          <InfoCard icon={Contact} title="Contact">
            <InfoList>
              <InfoRow icon={UserRound} label="Name">{inquiry.fullName}</InfoRow>
              <InfoRow icon={BriefcaseBusiness} label="Role">{inquiry.role}</InfoRow>
              <InfoRow icon={Mail} label="Email"><a className="break-all text-brand underline-offset-4 hover:underline" href={`mailto:${inquiry.email}`}>{inquiry.email}</a></InfoRow>
              <InfoRow icon={Phone} label="Phone"><a className="text-brand underline-offset-4 hover:underline" href={`tel:${inquiry.phone}`}>{inquiry.phone}</a></InfoRow>
            </InfoList>
          </InfoCard>
          <InfoCard icon={GraduationCap} title="Training request">
            <InfoList>
              <InfoRow icon={Presentation} label="Programme"><ProgramChip program={inquiry.program} /></InfoRow>
              <InfoRow icon={Users} label="Attendees">{inquiry.attendees}</InfoRow>
              <InfoRow icon={CalendarDays} label="Target dates">{targetDates}</InfoRow>
              <InfoRow icon={MapPin} label="Venue">{inquiry.venue}</InfoRow>
              <InfoRow icon={Sparkles} label="Also interested in">{inquiry.alsoInterested.length
                ? <span className="flex flex-wrap gap-1.5">{inquiry.alsoInterested.map(item => <ProgramChip key={item} program={item} />)}</span>
                : <span className="font-normal text-muted-foreground">None specified</span>}</InfoRow>
            </InfoList>
          </InfoCard>
          <InfoCard icon={MessageSquareText} title="Context" className="lg:col-span-2">
            {inquiry.context
              ? <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{inquiry.context}</p>
              : <p className="text-sm text-muted-foreground">None provided</p>}
          </InfoCard>
        </div>
      </TabsContent>

      <TabsContent value="history" forceMount className={TAB_PANEL}>
        <div className="mt-3 grid items-start gap-6 lg:grid-cols-[1fr_24rem]">
          <InfoCard icon={HistoryIcon} title="Activity">
            {inquiry.history.length === 0 && offset === 0 && <p className="mb-5 text-sm text-muted-foreground">No staff actions yet. Use the buttons at the top to record progress.</p>}
            <ol>
              {inquiry.history.map(entry => <HistoryEntry key={entry.id} entry={entry} />)}
              {!inquiry.historyHasMore && <TimelineItem icon={Inbox} title="Inquiry received" meta={<>Sent from the website · {formatCrmTime(inquiry.createdAt)}</>} />}
            </ol>
            {(offset > 0 || inquiry.historyHasMore) && <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4">
              <Button size="sm" variant="outline" disabled={offset === 0 || result.isFetching} onClick={() => setOffset(Math.max(0, offset - 20))}>Newer history</Button>
              <p className="text-xs text-muted-foreground">Page {Math.floor(offset / 20) + 1}</p>
              <Button size="sm" variant="outline" disabled={!inquiry.historyHasMore || result.isFetching || offset >= 100000} onClick={() => setOffset(offset + 20)}>Older history</Button>
            </div>}
          </InfoCard>
          <InquiryEmails inquiryId={inquiry.id} jobs={inquiry.emailJobs} />
        </div>
      </TabsContent>
    </Tabs>
  </div>;
}

/* What each recorded status change looks like in the activity trail. */
const STATUS_EVENTS: Partial<Record<InquiryStatus, { title: string; icon: LucideIcon; tone: TimelineTone }>> = {
  CONTACTED: { title: "First reply recorded", icon: MailCheck, tone: "info" },
  PROPOSAL_SENT: { title: "Proposal sent", icon: FileText, tone: "info" },
  WON: { title: "Marked won", icon: Trophy, tone: "success" },
  LOST: { title: "Marked lost", icon: CircleX, tone: "neutral" },
  SPAM: { title: "Marked spam", icon: Ban, tone: "neutral" }
};

type History = Awaited<ReturnType<typeof $getInquiry>>["history"][number];
function HistoryEntry({ entry }: { entry: History }) {
  const { changes } = entry;
  const actor = changes.actor?.to;
  const event = changes.emailRetry
    ? { title: "Email retry attempted", icon: RotateCw, tone: "warning" as const }
    : (changes.status?.to && STATUS_EVENTS[changes.status.to]) || { title: "Status changed", icon: CircleDot, tone: "neutral" as const };
  const status = (value: InquiryStatus | null) => value
    ? <Badge variant={inquiryStatusVariants[value]}>{inquiryStatusLabels[value]}</Badge>
    : <span className="text-muted-foreground">Not recorded</span>;
  const pesos = (value: number | null) => value === null ? "Not recorded" : formatPesos(value);

  return <TimelineItem icon={event.icon} tone={event.tone} title={event.title}
    meta={<>{actor ? <><span className="font-medium text-foreground">{actor.name}</span> ({actor.email})</> : "Staff"} · {formatCrmTime(entry.createdAt)}</>}>
    {changes.status && <p className="flex flex-wrap items-center gap-1.5">{status(changes.status.from)}<ArrowRight className="size-3.5 text-muted-foreground" />{status(changes.status.to)}</p>}
    {changes.estimatedValueCentavos && <p className="text-muted-foreground">Proposal value <span className="font-medium text-foreground">{pesos(changes.estimatedValueCentavos.from)}</span> → <span className="font-medium text-foreground">{pesos(changes.estimatedValueCentavos.to)}</span></p>}
    {changes.lostReason?.to && <blockquote className="border-l-2 pl-3 whitespace-pre-wrap break-words text-muted-foreground">{changes.lostReason.to}</blockquote>}
    {changes.emailRetry?.to && <p className="text-muted-foreground">Attempt {changes.emailRetry.to.attemptCount} recorded. See Email delivery for the current result.</p>}
  </TimelineItem>;
}
