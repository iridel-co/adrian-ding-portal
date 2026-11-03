import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Archive,
  Backpack,
  CalendarDays,
  FileText,
  Globe,
  ImageIcon,
  ListOrdered,
  PackageCheck,
  Plus,
  SlidersHorizontal,
  Tags,
  Target,
  Undo2,
  Users,
  Video
} from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/cms/content-list-page";
import { EditorShell, EditorSkeleton, type StatusAction } from "@/components/cms/editor-shell";
import { Crumb } from "@/components/crm/detail-parts";
import { Field, FormSection } from "@/components/cms/form-section";
import { MediaField } from "@/components/cms/media-field";
import type { PickedMedia } from "@/components/cms/media-picker";
import { MoneyField } from "@/components/cms/money-field";
import { PreviewButton } from "@/components/cms/preview-dialog";
import {
  CONTENT_STATUS_DISPLAY,
  SESSION_STATUS_DISPLAY,
  StatusBadge
} from "@/components/cms/status-badge";
import { StringListField } from "@/components/cms/string-list-field";
import { type PickedTerm, TermMultiPicker } from "@/components/cms/term-picker";
import { PublishChecklist } from "@/components/cms/publish-checklist";
import { useEditorForm } from "@/components/cms/use-editor-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONTENT_STATUS_ACTIONS, type ContentStatus } from "@/features/shared/content-status";
import { buildWorkshopPreview, type PreviewContent } from "@/features/preview/model";
import { formatDateRange } from "@/features/shared/format";
import {
  $setWorkshopStatus,
  $updateWorkshop,
  type WorkshopDetail,
  workshopQueryOptions
} from "@/features/workshops/functions";
import type { FieldAliases } from "@/features/shared/error-message";
import { publishChecklist } from "@/features/shared/publish";
import { WORKSHOP_FIELD_LABELS, workshopPublishSchema } from "@/features/workshops/schemas";

export const Route = createFileRoute("/_app/content/workshops/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(workshopQueryOptions(params.id)),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.workshop.title ?? "Workshop" }] }),
  pendingComponent: EditorSkeleton,
  component: WorkshopEditorPage
});

type WorkshopForm = {
  title: string;
  summary: string;
  problem: string;
  intro: string;
  audience: string;
  format: string;
  heroMedia: PickedMedia | null;
  primerVideoUrl: string;
  primerBlurb: string;
  defaultVenueName: string;
  defaultCity: string;
  defaultVenueMapUrl: string;
  defaultPriceCentavos: number | null;
  defaultPriceNote: string;
  defaultCapacity: number | null;
  outcomes: string[];
  curriculum: string[];
  inclusions: string[];
  whatToExpect: string[];
  tags: PickedTerm[];
};

const FIELD_ALIASES: FieldAliases = {
  heroMediaId: "heroMedia",
  tagIds: "tags"
};

function toForm(detail: WorkshopDetail): WorkshopForm {
  const { workshop } = detail;
  return {
    title: workshop.title,
    summary: workshop.summary,
    problem: workshop.problem,
    intro: workshop.intro,
    audience: workshop.audience,
    format: workshop.format,
    heroMedia: detail.heroMedia,
    primerVideoUrl: workshop.primerVideoUrl ?? "",
    primerBlurb: workshop.primerBlurb,
    defaultVenueName: workshop.defaultVenueName,
    defaultCity: workshop.defaultCity,
    defaultVenueMapUrl: workshop.defaultVenueMapUrl ?? "",
    defaultPriceCentavos: workshop.defaultPriceCentavos,
    defaultPriceNote: workshop.defaultPriceNote,
    defaultCapacity: workshop.defaultCapacity,
    outcomes: workshop.outcomes,
    curriculum: workshop.curriculum,
    inclusions: workshop.inclusions,
    whatToExpect: workshop.whatToExpect,
    tags: detail.tags
  };
}

function toSaveInput(form: WorkshopForm) {
  const { heroMedia, tags, ...values } = form;
  return {
    ...values,
    heroMediaId: heroMedia?.id ?? null,
    tagIds: tags.map((tag) => tag.id)
  };
}

function WorkshopEditorPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(workshopQueryOptions(id));
  return <WorkshopEditor key={data.workshop.updatedAt.toString()} detail={data} />;
}

/* Publish shows a globe, Archive a box, and moving back to draft an undo arrow. */
const CONTENT_ACTION_ICONS = { published: Globe, archived: Archive, draft: Undo2 } as const;

function WorkshopEditor({ detail }: { detail: WorkshopDetail }) {
  const queryClient = useQueryClient();
  const { workshop } = detail;
  const { values, setField, isDirty, markSaved, errors } = useEditorForm(
    toForm(detail),
    FIELD_ALIASES
  );
  const { fieldErrors, generalErrors, showErrors } = errors;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["workshops"] });

  const save = useMutation({
    mutationFn: () => $updateWorkshop({ data: { id: workshop.id, values: toSaveInput(values) } }),
    onSuccess: async () => {
      markSaved();
      toast.success("Workshop saved.");
      await refresh();
    },
    onError: showErrors
  });

  const setStatus = useMutation({
    mutationFn: (status: ContentStatus) =>
      $setWorkshopStatus({ data: { id: workshop.id, status } }),
    onSuccess: async () => {
      toast.success("Status updated.");
      await refresh();
    },
    onError: showErrors
  });

  const statusActions: StatusAction[] = CONTENT_STATUS_ACTIONS[workshop.status].map((action) => ({
    label: action.label,
    icon: CONTENT_ACTION_ICONS[action.to],
    isDestructive: action.to === "archived",
    onSelect: () => {
      if (isDirty) {
        toast.error("Save your changes first.");
        return;
      }
      setStatus.mutate(action.to);
    }
  }));

  const previewContent = useMemo((): PreviewContent => {
    const nextSession = detail.upcomingSessions.find((session) => session.status !== "cancelled");
    return {
      kind: "workshop",
      model: buildWorkshopPreview(values, nextSession ?? null)
    };
  }, [detail.upcomingSessions, values]);

  return (
    <EditorShell
      title={values.title}
      back={
        <Link to="/content/workshops">
          <Crumb>Workshops</Crumb>
        </Link>
      }
      status={CONTENT_STATUS_DISPLAY[workshop.status]}
      statusActions={statusActions}
      isLive={workshop.status === "published"}
      isSaving={save.isPending}
      isDirty={isDirty}
      errors={generalErrors}
      onSave={() => save.mutate()}
      preview={<PreviewButton content={previewContent} />}
      aside={
        <>
          {workshop.status === "draft" && (
            <PublishChecklist
              title="Ready to Publish"
              checks={publishChecklist(
                workshopPublishSchema,
                toSaveInput(values),
                WORKSHOP_FIELD_LABELS
              )}
            />
          )}
          <FormSection icon={ImageIcon} title="Hero Image" errors={fieldErrors.heroMedia}>
            <MediaField
              value={values.heroMedia}
              onChange={(media) => setField("heroMedia", media)}
            />
          </FormSection>
          <FormSection icon={Tags} title="Tags" errors={fieldErrors.tags}>
            <TermMultiPicker
              kind="workshop_tag"
              value={values.tags}
              onChange={(tags) => setField("tags", tags)}
              addLabel="Add tag"
            />
          </FormSection>
          <UpcomingSessions workshopId={workshop.id} sessions={detail.upcomingSessions} />
        </>
      }
    >
      <FormSection icon={FileText} title="Basics">
        <Field label="Title" htmlFor="title" errors={fieldErrors.title}>
          <Input
            id="title"
            value={values.title}
            onChange={(event) => setField("title", event.target.value)}
          />
        </Field>
        <Field
          label="Summary"
          htmlFor="summary"
          errors={fieldErrors.summary}
          hint="One or two sentences for the workshop card."
        >
          <Textarea
            id="summary"
            rows={2}
            value={values.summary}
            onChange={(event) => setField("summary", event.target.value)}
          />
        </Field>
        <Field
          label="Problem"
          htmlFor="problem"
          errors={fieldErrors.problem}
          hint="The hook line at the top of the page."
        >
          <Textarea
            id="problem"
            rows={2}
            value={values.problem}
            onChange={(event) => setField("problem", event.target.value)}
          />
        </Field>
        <Field label="Intro" htmlFor="intro" errors={fieldErrors.intro}>
          <Textarea
            id="intro"
            rows={4}
            value={values.intro}
            onChange={(event) => setField("intro", event.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection
        icon={Target}
        title="Outcomes"
        errors={fieldErrors.outcomes}
        description='Shown as "You leave able to…".'
      >
        <StringListField
          value={values.outcomes}
          onChange={(list) => setField("outcomes", list)}
          addLabel="Add outcome"
        />
      </FormSection>

      <FormSection
        icon={ListOrdered}
        title="Curriculum"
        errors={fieldErrors.curriculum}
        description='Shown as "What the day covers".'
      >
        <StringListField
          value={values.curriculum}
          onChange={(list) => setField("curriculum", list)}
          addLabel="Add topic"
        />
      </FormSection>

      <FormSection
        icon={PackageCheck}
        title="Inclusions"
        errors={fieldErrors.inclusions}
        description="What every attendee gets."
      >
        <StringListField
          value={values.inclusions}
          onChange={(list) => setField("inclusions", list)}
          addLabel="Add inclusion"
        />
      </FormSection>

      <FormSection
        icon={Backpack}
        title="What to Expect"
        errors={fieldErrors.whatToExpect}
        description="Arrival, dress code and what to bring."
      >
        <StringListField
          value={values.whatToExpect}
          onChange={(list) => setField("whatToExpect", list)}
          addLabel="Add item"
        />
      </FormSection>

      <FormSection icon={Users} title="Audience and Format">
        <Field label="Who it's for" htmlFor="audience" errors={fieldErrors.audience}>
          <Textarea
            id="audience"
            rows={2}
            value={values.audience}
            onChange={(event) => setField("audience", event.target.value)}
          />
        </Field>
        <Field label="Format" htmlFor="format" errors={fieldErrors.format}>
          <Textarea
            id="format"
            rows={2}
            value={values.format}
            onChange={(event) => setField("format", event.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection icon={Video} title="Primer Video">
        <Field
          label="Video link"
          htmlFor="primerVideoUrl"
          errors={fieldErrors.primerVideoUrl}
          hint="A full https:// link."
        >
          <Input
            id="primerVideoUrl"
            type="url"
            placeholder="https://"
            value={values.primerVideoUrl}
            onChange={(event) => setField("primerVideoUrl", event.target.value)}
          />
        </Field>
        <Field label="Blurb" htmlFor="primerBlurb" errors={fieldErrors.primerBlurb}>
          <Textarea
            id="primerBlurb"
            rows={2}
            value={values.primerBlurb}
            onChange={(event) => setField("primerBlurb", event.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection
        icon={SlidersHorizontal}
        title="Session Defaults"
        description="New sessions start with these values. Existing sessions keep their own."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Venue" htmlFor="defaultVenueName" errors={fieldErrors.defaultVenueName}>
            <Input
              id="defaultVenueName"
              value={values.defaultVenueName}
              onChange={(event) => setField("defaultVenueName", event.target.value)}
            />
          </Field>
          <Field label="City" htmlFor="defaultCity" errors={fieldErrors.defaultCity}>
            <Input
              id="defaultCity"
              value={values.defaultCity}
              onChange={(event) => setField("defaultCity", event.target.value)}
            />
          </Field>
        </div>
        <Field
          label="Venue map link"
          htmlFor="defaultVenueMapUrl"
          errors={fieldErrors.defaultVenueMapUrl}
          hint="A full https:// link."
        >
          <Input
            id="defaultVenueMapUrl"
            type="url"
            placeholder="https://maps.google.com/…"
            value={values.defaultVenueMapUrl}
            onChange={(event) => setField("defaultVenueMapUrl", event.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Price" htmlFor="defaultPrice" errors={fieldErrors.defaultPriceCentavos}>
            <MoneyField
              id="defaultPrice"
              value={values.defaultPriceCentavos}
              onChange={(centavos) => setField("defaultPriceCentavos", centavos)}
            />
          </Field>
          <Field
            label="Price note"
            htmlFor="defaultPriceNote"
            errors={fieldErrors.defaultPriceNote}
            hint="e.g. VAT exclusive"
          >
            <Input
              id="defaultPriceNote"
              value={values.defaultPriceNote}
              onChange={(event) => setField("defaultPriceNote", event.target.value)}
            />
          </Field>
          <Field label="Capacity" htmlFor="defaultCapacity" errors={fieldErrors.defaultCapacity}>
            <Input
              id="defaultCapacity"
              type="number"
              min={1}
              value={values.defaultCapacity ?? ""}
              onChange={(event) =>
                setField(
                  "defaultCapacity",
                  event.target.value === "" ? null : Number(event.target.value)
                )
              }
            />
          </Field>
        </div>
      </FormSection>
    </EditorShell>
  );
}

type UpcomingSessionsProps = {
  workshopId: string;
  sessions: WorkshopDetail["upcomingSessions"];
};

function UpcomingSessions({ workshopId, sessions }: UpcomingSessionsProps) {
  return (
    <FormSection icon={CalendarDays} title="Upcoming Sessions">
      {sessions.length === 0 ? (
        <EmptyState icon={CalendarDays} className="py-6 shadow-none">
          No upcoming sessions.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center justify-between gap-2">
              <Link
                to="/content/sessions/$id"
                params={{ id: session.id }}
                className="hover:underline"
              >
                {formatDateRange(session.date, session.endDate)}
              </Link>
              <StatusBadge display={SESSION_STATUS_DISPLAY[session.status]} />
            </li>
          ))}
        </ul>
      )}
      <Button asChild variant="outline" size="sm" className="self-start">
        <Link to="/content/sessions" search={{ workshopId, create: true }}>
          <Plus />
          New session
        </Link>
      </Button>
    </FormSection>
  );
}
