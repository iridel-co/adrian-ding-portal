import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Archive, FileText, Globe, ImageIcon, Undo2, UsersRound } from "lucide-react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { EditorShell, EditorSkeleton, type StatusAction } from "@/components/cms/editor-shell";
import { Crumb } from "@/components/crm/detail-parts";
import { Field, FormSection } from "@/components/cms/form-section";
import { MediaField } from "@/components/cms/media-field";
import type { PickedMedia } from "@/components/cms/media-picker";
import { PreviewButton } from "@/components/cms/preview-dialog";
import { SlugField } from "@/components/cms/slug-field";
import { CONTENT_STATUS_DISPLAY } from "@/components/cms/status-badge";
import { StringListField } from "@/components/cms/string-list-field";
import { PublishChecklist } from "@/components/cms/publish-checklist";
import { useEditorForm } from "@/components/cms/use-editor-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  $setProgramStatus,
  $updateProgram,
  type ProgramDetail,
  programQueryOptions
} from "@/features/corporate-trainings/functions";
import {
  PROGRAM_FIELD_LABELS,
  programPublishSchema,
  SUMMARY_MAX_LENGTH,
  USEFUL_FOR_MAX_ITEMS
} from "@/features/corporate-trainings/schemas";
import { buildProgramRowPreview, type PreviewContent } from "@/features/preview/model";
import { CONTENT_STATUS_ACTIONS, type ContentStatus } from "@/features/shared/content-status";
import type { FieldAliases } from "@/features/shared/error-message";
import { CENTER_FOCUS, type ImageFocus } from "@/features/shared/image-focus";
import { publishChecklist } from "@/features/shared/publish";

export const Route = createFileRoute("/_app/content/corporate-trainings/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(programQueryOptions(params.id)),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.program.title ?? "Program" }] }),
  pendingComponent: EditorSkeleton,
  component: ProgramEditorPage
});

type ProgramForm = {
  title: string;
  slug: string;
  summary: string;
  image: PickedMedia | null;
  imageFocus: ImageFocus;
  usefulFor: string[];
};

const FIELD_ALIASES: FieldAliases = {
  imageMediaId: "image",
  imageFocusX: "image",
  imageFocusY: "image"
};

function toForm(detail: ProgramDetail): ProgramForm {
  const { program } = detail;
  return {
    title: program.title,
    slug: program.slug,
    summary: program.summary,
    image: detail.image,
    imageFocus: { x: program.imageFocusX, y: program.imageFocusY },
    usefulFor: program.usefulFor
  };
}

function toSaveInput(form: ProgramForm) {
  const { image, imageFocus, ...values } = form;
  return {
    ...values,
    imageMediaId: image?.id ?? null,
    imageFocusX: imageFocus.x,
    imageFocusY: imageFocus.y
  };
}

function ProgramEditorPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(programQueryOptions(id));
  return <ProgramEditor key={data.program.updatedAt.toString()} detail={data} />;
}

/* Publish shows a globe, Archive a box, and moving back to draft an undo arrow. */
const CONTENT_ACTION_ICONS = { published: Globe, archived: Archive, draft: Undo2 } as const;

function ProgramEditor({ detail }: { detail: ProgramDetail }) {
  const queryClient = useQueryClient();
  const { program } = detail;
  const { values, setField, isDirty, markSaved, errors } = useEditorForm(
    toForm(detail),
    FIELD_ALIASES
  );
  const { fieldErrors, generalErrors, showErrors } = errors;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["programs"] });

  const save = useMutation({
    mutationFn: () => $updateProgram({ data: { id: program.id, values: toSaveInput(values) } }),
    onSuccess: async () => {
      markSaved();
      toast.success("Program saved.");
      await refresh();
    },
    onError: showErrors
  });

  const setStatus = useMutation({
    mutationFn: (status: ContentStatus) => $setProgramStatus({ data: { id: program.id, status } }),
    onSuccess: async () => {
      toast.success("Status updated.");
      await refresh();
    },
    onError: showErrors
  });

  const statusActions: StatusAction[] = CONTENT_STATUS_ACTIONS[program.status].map((action) => ({
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

  const setSlug = useCallback((slug: string) => setField("slug", slug), [setField]);

  const previewContent = useMemo(
    (): PreviewContent =>
      buildProgramRowPreview({ id: program.id, ...values }, detail.publishedCards),
    [detail.publishedCards, program.id, values]
  );

  return (
    <EditorShell
      title={values.title}
      back={
        <Link to="/content/corporate-trainings">
          <Crumb>Corporate trainings</Crumb>
        </Link>
      }
      status={CONTENT_STATUS_DISPLAY[program.status]}
      statusActions={statusActions}
      isLive={program.status === "published"}
      isSaving={save.isPending}
      isDirty={isDirty}
      errors={generalErrors}
      onSave={() => save.mutate()}
      preview={<PreviewButton content={previewContent} />}
      aside={
        <>
          {program.status === "draft" && (
            <PublishChecklist
              title="Ready to Publish"
              checks={publishChecklist(
                programPublishSchema,
                toSaveInput(values),
                PROGRAM_FIELD_LABELS
              )}
            />
          )}
          <FormSection icon={ImageIcon} title="Card Image" errors={fieldErrors.image}>
            <MediaField
              value={values.image}
              onChange={(media) => {
                setField("image", media);
                setField("imageFocus", CENTER_FOCUS);
              }}
              focus={values.imageFocus}
              onFocusChange={(focus) => setField("imageFocus", focus)}
            />
          </FormSection>
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
          label="Slug"
          htmlFor="slug"
          errors={fieldErrors.slug}
          hint="Used in the Inquire link, e.g. /corporate-training?program=leadership"
        >
          <SlugField id="slug" title={values.title} value={values.slug} onChange={setSlug} />
        </Field>
        <Field
          label="Summary"
          htmlFor="summary"
          errors={fieldErrors.summary}
          hint="One sentence. Shows on the card on desktop until a visitor hovers it."
        >
          <Textarea
            id="summary"
            rows={2}
            maxLength={SUMMARY_MAX_LENGTH}
            value={values.summary}
            onChange={(event) => setField("summary", event.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection
        icon={UsersRound}
        title="Useful For"
        errors={fieldErrors.usefulFor}
        description="Who the program is for. Shows on the card."
      >
        <StringListField
          value={values.usefulFor}
          onChange={(list) => setField("usefulFor", list)}
          addLabel="Add item"
          maxItems={USEFUL_FOR_MAX_ITEMS}
        />
      </FormSection>
    </EditorShell>
  );
}
