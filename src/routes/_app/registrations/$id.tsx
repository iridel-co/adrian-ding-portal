import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { SESSION_STATUS_DISPLAY, StatusBadge } from "@/components/cms/status-badge";
import { CrmReadState } from "@/components/crm/read-state";
import { emptyRegistrationDraft, paymentMethodLabels, RegistrationActions, type RegistrationDraft } from "@/components/crm/registration-actions";
import { RegistrationEmails } from "@/components/crm/registration-emails";
import { RegistrationHistory } from "@/components/crm/registration-history";
import { RegistrationStatus } from "@/components/crm/registration-status";
import { Button } from "@/components/ui/button";
import { formatInquiryTime, isInquiryAccessError } from "@/features/crm/presentation";
import { registrationWorkspaceSearchSchema } from "@/features/crm/registration-navigation";
import { registrationErrorMessage } from "@/features/crm/registration-presentation";
import { registrationQueryKey, registrationQueryOptions } from "@/features/crm/registration-queries";
import { formatDateRange, formatTimeRange } from "@/features/shared/format";
import { formatPesos } from "@/features/shared/money";

export const Route = createFileRoute("/_app/registrations/$id")({
  validateSearch: registrationWorkspaceSearchSchema,
  head: () => ({ meta: [{ title: "Workshop registration" }] }),
  component: RegistrationPage
});

function RegistrationPage() {
  const { id } = Route.useParams();
  return <RegistrationDetail key={id} id={id} />;
}

function RegistrationDetail({ id }: { id: string }) {
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const [historyOffset, setHistoryOffset] = useState(0);
  const result = useQuery(registrationQueryOptions(id));
  const olderHistory = useQuery({ ...registrationQueryOptions(id, historyOffset),
    enabled: historyOffset > 0 && !!result.data && !result.isError });
  const history = historyOffset === 0 ? result : olderHistory;
  const refresh = () => { void result.refetch(); if (historyOffset > 0) void olderHistory.refetch(); };
  const [draft, setDraft] = useState<RegistrationDraft>(emptyRegistrationDraft);
  const [actionAccessError, setActionAccessError] = useState<Error | null>(null);
  const error = actionAccessError || result.error || (isInquiryAccessError(history.error) ? history.error : null);
  useEffect(() => {
    if (isInquiryAccessError(error)) {
      setActionAccessError(error instanceof Error ? error : null);
      setDraft(emptyRegistrationDraft);
      queryClient.removeQueries({ queryKey: registrationQueryKey });
    }
  }, [error, queryClient]);
  const registration = result.data;
  const showRegistration = !result.isError && !error && !!registration;
  return <div className="mx-auto flex max-w-5xl flex-col gap-6">
    <div className="flex items-center justify-between gap-3">
      <Link to="/registrations" search={{ when: search.runWhen, offset: search.runOffset }} className="text-sm underline underline-offset-4">Workshop runs</Link>
      <Button variant="outline" disabled={result.isFetching} onClick={refresh}>Refresh</Button>
    </div>
    <CrmReadState pending={result.isPending && !actionAccessError} error={error}
      retry={() => { setActionAccessError(null); refresh(); }} loadingMessage="Loading registration…"
      accessTitle="Registration access unavailable" errorMessage={registrationErrorMessage} />
    {showRegistration && <>
      <Link to="/registrations/sessions/$sessionId" params={{ sessionId: registration.workshopSessionId }} search={search}
        className="text-sm underline underline-offset-4">Back to {search.tab === "overview" ? "run overview" : "run registrations"}</Link>
      <header className="space-y-3">
        <p className="text-sm text-muted-foreground">{registration.reference}</p>
        <h1 className="font-display text-3xl sm:text-4xl">{registration.fullName}</h1>
        <RegistrationStatus isPaid={registration.isPaid} cancelledAt={registration.cancelledAt} />
      </header>
      <section className="space-y-3 rounded-lg border p-5" aria-label="Workshop run">
        <h2 className="text-xl font-medium">{registration.session.workshopTitle}</h2>
        <p className="text-sm text-muted-foreground">{registration.session.courseCode || "No course code"}</p>
        <StatusBadge display={SESSION_STATUS_DISPLAY[registration.session.status]} />
        <p>{formatDateRange(registration.session.date, registration.session.endDate)} · {formatTimeRange(registration.session.startTime, registration.session.endTime)} Manila time</p>
        <p>{registration.session.venueName || "Venue not set"}{registration.session.city && ` · ${registration.session.city}`}</p>
      </section>
      <section className="space-y-4 rounded-lg border p-5" aria-labelledby="registration-submitted">
        <h2 id="registration-submitted" className="text-xl font-medium">Submitted information</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">{registration.email}</Field><Field label="Phone">{registration.phone}</Field>
          <Field label="Occupation">{registration.occupation}</Field><Field label="Salary range">{registration.salaryRange}</Field>
          <Field label="City">{registration.city || "Not provided"}</Field><Field label="Saved registration price">{formatPesos(registration.priceCentavos)}</Field>
          <Field label="Submitted">{formatInquiryTime(registration.createdAt)}</Field><Field label="Consent recorded">{formatInquiryTime(registration.consentAt)}</Field>
        </dl>
      </section>
      <section className="space-y-4 rounded-lg border p-5" aria-labelledby="registration-payment">
        <h2 id="registration-payment" className="text-xl font-medium">Payment verification</h2>
        {registration.verifiedAt ? <>
          {!registration.isPaid && <p className="text-sm text-muted-foreground">The previous verification is retained. This registration is currently {registration.cancelledAt ? "Cancelled" : "Unpaid"}.</p>}
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Payment method">{registration.paymentMethod ? paymentMethodLabels[registration.paymentMethod] : "Not recorded"}</Field>
            <Field label="Verified amount">{registration.paidAmountCentavos === null ? "Not recorded" : formatPesos(registration.paidAmountCentavos)}</Field>
            <Field label="Payer name">{registration.payerName}</Field><Field label="Provider transaction reference">{registration.providerTransactionReference}</Field>
            <Field label="Verified at">{formatInquiryTime(registration.verifiedAt)}</Field>
            <Field label="Verified by">{registration.verifiedByName ?? "Staff identity not available"}</Field>
          </dl>
        </> : <p className="text-sm text-muted-foreground">Payment has not been verified.</p>}
      </section>
      {registration.cancelledAt && <section className="space-y-4 rounded-lg border p-5" aria-labelledby="registration-cancellation">
        <h2 id="registration-cancellation" className="text-xl font-medium">Cancellation</h2>
        <dl className="grid gap-4 sm:grid-cols-2"><Field label="Cancelled at">{formatInquiryTime(registration.cancelledAt)}</Field>
          <Field label="Reason">{registration.cancellationReason}</Field>
          <Field label="Cancelled by">{registration.cancelledByName ?? "Staff identity not available"}</Field></dl>
        <p className="text-sm text-muted-foreground">This registration does not reserve a seat.</p>
      </section>}
      <RegistrationActions registration={registration} draft={draft} setDraft={setDraft} onAccessError={setActionAccessError}
        onChanged={() => setHistoryOffset(0)} />
      <RegistrationEmails registration={registration} onAccessError={setActionAccessError} onChanged={() => setHistoryOffset(0)} />
      <RegistrationHistory entries={history.data?.history ?? []} offset={historyOffset} hasMore={history.data?.historyHasMore ?? false}
        pending={history.isPending} fetching={history.isFetching} error={history.error} retry={() => void history.refetch()} onPage={setHistoryOffset} />
    </>}
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{children}</dd></div>;
}
