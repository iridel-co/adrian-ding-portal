import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BackLink, EditorShell, type StatusAction } from "@/components/cms/editor-shell";
import { Field, FormSection } from "@/components/cms/form-section";
import { MoneyField } from "@/components/cms/money-field";
import { PreviewButton } from "@/components/cms/preview-dialog";
import {
  PAST_DISPLAY,
  SESSION_STATUS_DISPLAY,
  StatusBadge
} from "@/components/cms/status-badge";
import { VenueSuggestInput } from "@/components/cms/suggest-input";
import { useEditorForm } from "@/components/cms/use-editor-form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  buildSessionPreview,
  type PreviewContent,
  type WorkshopPreviewSource
} from "@/features/preview/model";
import { formatDateRange } from "@/features/shared/format";
import { type WorkshopDetail, workshopQueryOptions } from "@/features/workshops/functions";
import { allowedSessionTransitions, type SessionStatus } from "@/features/sessions/status";
import {
  $setSessionStatus,
  $updateSession,
  type SessionDetail,
  sessionQueryOptions
} from "@/features/sessions/functions";
import { errorMessage } from "@/features/shared/error-message";

export const Route = createFileRoute("/_app/content/sessions/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(sessionQueryOptions(params.id)),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.workshop.title ?? "Session" }] }),
  component: SessionEditorPage
});

type SessionForm = {
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  venueName: string;
  city: string;
  venueMapUrl: string;
  registrationCutoff: string;
  priceCentavos: number | null;
  priceNote: string;
  capacity: number | null;
};

const STATUS_ACTION_LABELS: Record<SessionStatus, string> = {
  draft: "Back to draft",
  open: "Open registration",
  closed: "Close registration",
  cancelled: "Cancel session"
};

function toForm(detail: SessionDetail): SessionForm {
  const { session } = detail;
  return {
    date: session.date,
    endDate: session.endDate === session.date ? "" : session.endDate,
    startTime: session.startTime.slice(0, 5),
    endTime: session.endTime.slice(0, 5),
    venueName: session.venueName,
    city: session.city,
    venueMapUrl: session.venueMapUrl ?? "",
    registrationCutoff: detail.registrationCutoff,
    priceCentavos: session.priceCentavos,
    priceNote: session.priceNote,
    capacity: session.capacity
  };
}

function toWorkshopPreviewSource(detail: WorkshopDetail): WorkshopPreviewSource {
  const { workshop } = detail;
  return {
    ...workshop,
    tags: detail.tags,
    heroMedia: detail.heroMedia,
    primerVideoUrl: workshop.primerVideoUrl ?? "",
    defaultVenueMapUrl: workshop.defaultVenueMapUrl ?? ""
  };
}

function SessionEditorPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(sessionQueryOptions(id));
  return <SessionEditor key={data.session.updatedAt.toString()} detail={data} />;
}

function SessionEditor({ detail }: { detail: SessionDetail }) {
  const queryClient = useQueryClient();
  const { session } = detail;
  const { values, setField, isDirty, markSaved } = useEditorForm(toForm(detail));
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const isLocked = session.status === "cancelled";
  const { data: parent } = useQuery(workshopQueryOptions(detail.workshop.id));

  const previewContent = useMemo((): PreviewContent | null => {
    if (!parent) return null;

    return {
      kind: "workshop",
      model: buildSessionPreview(toWorkshopPreviewSource(parent), values)
    };
  }, [parent, values]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["workshops"] })
    ]);

  const save = useMutation({
    mutationFn: () => {
      const { priceCentavos, capacity } = values;
      if (priceCentavos === null) throw new Error("Enter a price.");
      if (capacity === null) throw new Error("Enter a capacity.");

      return $updateSession({
        data: {
          id: session.id,
          values: { ...values, priceCentavos, capacity }
        }
      });
    },
    onSuccess: async () => {
      markSaved();
      toast.success("Session saved.");
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const setStatus = useMutation({
    mutationFn: (status: SessionStatus) =>
      $setSessionStatus({ data: { id: session.id, status } }),
    onSuccess: async () => {
      toast.success("Status updated.");
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const nextStatuses = allowedSessionTransitions(session.status, {
    hasStarted: detail.hasStarted,
    hasEnded: detail.isPast
  });

  const statusActions: StatusAction[] = nextStatuses.map((status) => ({
    label: STATUS_ACTION_LABELS[status],
    isDestructive: status === "cancelled",
    onSelect: () => {
      if (isDirty) {
        toast.error("Save your changes first.");
        return;
      }
      if (status === "cancelled") {
        setIsCancelDialogOpen(true);
        return;
      }
      setStatus.mutate(status);
    }
  }));

  return (
    <>
      <EditorShell
        title={`${detail.workshop.title}, ${formatDateRange(session.date, session.endDate)}`}
        back={
          <Link to="/content/sessions">
            <BackLink>All sessions</BackLink>
          </Link>
        }
        status={SESSION_STATUS_DISPLAY[session.status]}
        statusActions={statusActions}
        isLive={session.status === "open" && !detail.isPast}
        liveNote="Registration is open. Changes show on the site when you save."
        lastEdited={{ name: detail.updatedByName, at: session.updatedAt }}
        isSaving={save.isPending}
        isDirty={isDirty && !isLocked}
        onSave={() => save.mutate()}
        preview={previewContent && <PreviewButton content={previewContent} />}
        aside={
          <FormSection title="Workshop">
            <Link
              to="/content/workshops/$id"
              params={{ id: detail.workshop.id }}
              className="text-sm font-medium hover:underline"
            >
              {detail.workshop.title}
            </Link>
            {detail.workshop.status !== "published" && (
              <p className="text-xs text-muted-foreground">
                Publish this workshop before you open the session.
              </p>
            )}
            {detail.isPast && <StatusBadge display={PAST_DISPLAY} />}
          </FormSection>
        }
      >
        <fieldset disabled={isLocked} className="flex flex-col gap-6">
          <FormSection title="Date and time" description="All times are Manila time.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="First day" htmlFor="date">
                <Input
                  id="date"
                  type="date"
                  value={values.date}
                  onChange={(event) => setField("date", event.target.value)}
                />
              </Field>
              <Field label="Last day" htmlFor="endDate" hint="Leave empty for a one-day session.">
                <Input
                  id="endDate"
                  type="date"
                  min={values.date}
                  value={values.endDate}
                  onChange={(event) => setField("endDate", event.target.value)}
                />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Starts each day" htmlFor="startTime">
                <Input
                  id="startTime"
                  type="time"
                  value={values.startTime}
                  onChange={(event) => setField("startTime", event.target.value)}
                />
              </Field>
              <Field label="Ends each day" htmlFor="endTime">
                <Input
                  id="endTime"
                  type="time"
                  value={values.endTime}
                  onChange={(event) => setField("endTime", event.target.value)}
                />
              </Field>
            </div>
            <Field
              label="Registration closes"
              htmlFor="registrationCutoff"
              hint="Leave empty to close registration when the session starts."
            >
              <Input
                id="registrationCutoff"
                type="datetime-local"
                value={values.registrationCutoff}
                onChange={(event) => setField("registrationCutoff", event.target.value)}
              />
            </Field>
          </FormSection>

          <FormSection title="Venue">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Venue" htmlFor="venueName">
                <VenueSuggestInput
                  id="venueName"
                  field="venueName"
                  value={values.venueName}
                  onChange={(value) => setField("venueName", value)}
                />
              </Field>
              <Field label="City" htmlFor="city">
                <VenueSuggestInput
                  id="city"
                  field="city"
                  value={values.city}
                  onChange={(value) => setField("city", value)}
                />
              </Field>
            </div>
            <Field label="Map link" htmlFor="venueMapUrl" hint="A full https:// link.">
              <Input
                id="venueMapUrl"
                type="url"
                placeholder="https://maps.google.com/…"
                value={values.venueMapUrl}
                onChange={(event) => setField("venueMapUrl", event.target.value)}
              />
            </Field>
          </FormSection>

          <FormSection title="Price and seats">
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Price" htmlFor="price">
                <MoneyField
                  id="price"
                  value={values.priceCentavos}
                  onChange={(centavos) => setField("priceCentavos", centavos)}
                />
              </Field>
              <Field label="Price note" htmlFor="priceNote" hint="e.g. VAT exclusive">
                <Input
                  id="priceNote"
                  value={values.priceNote}
                  onChange={(event) => setField("priceNote", event.target.value)}
                />
              </Field>
              <Field label="Capacity" htmlFor="capacity">
                <Input
                  id="capacity"
                  type="number"
                  min={1}
                  value={values.capacity ?? ""}
                  onChange={(event) =>
                    setField(
                      "capacity",
                      event.target.value === "" ? null : Number(event.target.value)
                    )
                  }
                />
              </Field>
            </div>
          </FormSection>
        </fieldset>
      </EditorShell>

      <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
            <AlertDialogDescription>
              Registration closes for good. The CRM notifies everyone who registered. You can't
              undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep session</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => setStatus.mutate("cancelled")}
            >
              Cancel session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
