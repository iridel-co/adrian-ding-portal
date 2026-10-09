import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { BackLink, EditorShell, type StatusAction } from "@/components/cms/editor-shell";
import { Field, FormSection } from "@/components/cms/form-section";
import { MediaField } from "@/components/cms/media-field";
import type { PickedMedia } from "@/components/cms/media-picker";
import { MoneyField } from "@/components/cms/money-field";
import { PreviewButton } from "@/components/cms/preview-dialog";
import { SlugField } from "@/components/cms/slug-field";
import {
  CONTENT_STATUS_DISPLAY,
  SESSION_STATUS_DISPLAY,
  StatusBadge
} from "@/components/cms/status-badge";
import { StringListField } from "@/components/cms/string-list-field";
import { type PickedTerm, TermMultiPicker } from "@/components/cms/term-picker";
import { useEditorForm } from "@/components/cms/use-editor-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ContentStatus } from "@/features/shared/content-status";
import { buildWorkshopPreview, type PreviewContent } from "@/features/preview/model";
import { formatDateRange } from "@/features/shared/format";
import {
  $setWorkshopStatus,
  $updateWorkshop,
  type WorkshopDetail,
  workshopQueryOptions
} from "@/features/workshops/functions";
import { errorMessage } from "@/features/shared/error-message";

export const Route = createFileRoute("/_app/content/workshops/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(workshopQueryOptions(params.id)),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.workshop.title ?? "Workshop" }] }),
  component: WorkshopEditorPage
});

type WorkshopForm = {
  title: string;
  slug: string;
  courseCode: string;
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

function toForm(detail: WorkshopDetail): WorkshopForm {
  const { workshop } = detail;
  return {
    title: workshop.title,
    slug: workshop.slug,
    courseCode: workshop.courseCode ?? "",
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

const STATUS_ACTION_LABELS: Record<ContentStatus, { label: string; to: ContentStatus }[]> = {
  draft: [
    { label: "Publish", to: "published" },
    { label: "Archive", to: "archived" }
  ],
  published: [
    { label: "Unpublish (back to draft)", to: "draft" },
    { label: "Archive", to: "archived" }
  ],
  archived: [{ label: "Restore as draft", to: "draft" }]
};

function WorkshopEditorPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(workshopQueryOptions(id));
  return <WorkshopEditor key={data.workshop.updatedAt.toString()} detail={data} />;
}

function WorkshopEditor({ detail }: { detail: WorkshopDetail }) {
  const queryClient = useQueryClient();
  const { workshop } = detail;
  const { values, setField, isDirty, markSaved } = useEditorForm(toForm(detail));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["workshops"] });

  const save = useMutation({
    mutationFn: () => $updateWorkshop({ data: { id: workshop.id, values: toSaveInput(values) } }),
    onSuccess: async () => {
      markSaved();
      toast.success("Workshop saved.");
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const setStatus = useMutation({
    mutationFn: (status: ContentStatus) =>
      $setWorkshopStatus({ data: { id: workshop.id, status } }),
    onSuccess: async () => {
      toast.success("Status updated.");
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const statusActions: StatusAction[] = STATUS_ACTION_LABELS[workshop.status].map((action) => ({
    label: action.label,
    isDestructive: action.to === "archived",
    onSelect: () => {
      if (isDirty) {
        toast.error("Save your changes first.");
        return;
      }
      setStatus.mutate(action.to);
    }
  }));

  const setSlug = useCallback((slug: string) => setField("slug", slug), [setField]);

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
          <BackLink>All workshops</BackLink>
        </Link>
      }
      status={CONTENT_STATUS_DISPLAY[workshop.status]}
      statusActions={statusActions}
      isLive={workshop.status === "published"}
      lastEdited={{ name: detail.updatedByName, at: workshop.updatedAt }}
      isSaving={save.isPending}
      isDirty={isDirty}
      onSave={() => save.mutate()}
      preview={<PreviewButton content={previewContent} />}
      aside={
        <>
          <FormSection title="Hero image">
            <MediaField
              value={values.heroMedia}
              onChange={(media) => setField("heroMedia", media)}
            />
          </FormSection>
          <FormSection title="Tags">
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
      <FormSection title="Basics">
        <Field label="Title" htmlFor="title">
          <Input
            id="title"
            value={values.title}
            onChange={(event) => setField("title", event.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="Slug"
            htmlFor="slug"
            hint="The page address, e.g. /workshops/coaching-for-managers"
          >
            <SlugField id="slug" title={values.title} value={values.slug} onChange={setSlug} />
          </Field>
          <Field
            label="Course code"
            htmlFor="courseCode"
            hint="2 to 8 capital letters or digits. Used in reference IDs, e.g. AD-PSW-0042."
          >
            <Input
              id="courseCode"
              className="font-mono uppercase"
              value={values.courseCode}
              onChange={(event) => setField("courseCode", event.target.value.toUpperCase())}
            />
          </Field>
        </div>
        <Field label="Summary" htmlFor="summary" hint="One or two sentences for the workshop card.">
          <Textarea
            id="summary"
            rows={2}
            value={values.summary}
            onChange={(event) => setField("summary", event.target.value)}
          />
        </Field>
        <Field label="Problem" htmlFor="problem" hint="The hook line at the top of the page.">
          <Textarea
            id="problem"
            rows={2}
            value={values.problem}
            onChange={(event) => setField("problem", event.target.value)}
          />
        </Field>
        <Field label="Intro" htmlFor="intro">
          <Textarea
            id="intro"
            rows={4}
            value={values.intro}
            onChange={(event) => setField("intro", event.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Outcomes" description='Shown as "You leave able to…".'>
        <StringListField
          value={values.outcomes}
          onChange={(list) => setField("outcomes", list)}
          addLabel="Add outcome"
        />
      </FormSection>

      <FormSection title="Curriculum" description='Shown as "What the day covers".'>
        <StringListField
          value={values.curriculum}
          onChange={(list) => setField("curriculum", list)}
          addLabel="Add topic"
        />
      </FormSection>

      <FormSection title="Inclusions" description="What every attendee gets.">
        <StringListField
          value={values.inclusions}
          onChange={(list) => setField("inclusions", list)}
          addLabel="Add inclusion"
        />
      </FormSection>

      <FormSection title="What to expect" description="Arrival, dress code and what to bring.">
        <StringListField
          value={values.whatToExpect}
          onChange={(list) => setField("whatToExpect", list)}
          addLabel="Add item"
        />
      </FormSection>

      <FormSection title="Audience and format">
        <Field label="Who it's for" htmlFor="audience">
          <Textarea
            id="audience"
            rows={2}
            value={values.audience}
            onChange={(event) => setField("audience", event.target.value)}
          />
        </Field>
        <Field label="Format" htmlFor="format">
          <Textarea
            id="format"
            rows={2}
            value={values.format}
            onChange={(event) => setField("format", event.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Primer video">
        <Field label="Video link" htmlFor="primerVideoUrl" hint="A full https:// link.">
          <Input
            id="primerVideoUrl"
            type="url"
            placeholder="https://"
            value={values.primerVideoUrl}
            onChange={(event) => setField("primerVideoUrl", event.target.value)}
          />
        </Field>
        <Field label="Blurb" htmlFor="primerBlurb">
          <Textarea
            id="primerBlurb"
            rows={2}
            value={values.primerBlurb}
            onChange={(event) => setField("primerBlurb", event.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection
        title="Session defaults"
        description="New sessions start with these values. Existing sessions keep their own."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Venue" htmlFor="defaultVenueName">
            <Input
              id="defaultVenueName"
              value={values.defaultVenueName}
              onChange={(event) => setField("defaultVenueName", event.target.value)}
            />
          </Field>
          <Field label="City" htmlFor="defaultCity">
            <Input
              id="defaultCity"
              value={values.defaultCity}
              onChange={(event) => setField("defaultCity", event.target.value)}
            />
          </Field>
        </div>
        <Field label="Venue map link" htmlFor="defaultVenueMapUrl" hint="A full https:// link.">
          <Input
            id="defaultVenueMapUrl"
            type="url"
            placeholder="https://maps.google.com/…"
            value={values.defaultVenueMapUrl}
            onChange={(event) => setField("defaultVenueMapUrl", event.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Price" htmlFor="defaultPrice">
            <MoneyField
              id="defaultPrice"
              value={values.defaultPriceCentavos}
              onChange={(centavos) => setField("defaultPriceCentavos", centavos)}
            />
          </Field>
          <Field label="Price note" htmlFor="defaultPriceNote" hint="e.g. VAT exclusive">
            <Input
              id="defaultPriceNote"
              value={values.defaultPriceNote}
              onChange={(event) => setField("defaultPriceNote", event.target.value)}
            />
          </Field>
          <Field label="Capacity" htmlFor="defaultCapacity">
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
    <FormSection title="Upcoming sessions">
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No upcoming sessions.</p>
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
