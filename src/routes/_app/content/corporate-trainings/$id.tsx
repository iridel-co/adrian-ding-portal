import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import { BackLink, EditorShell, type StatusAction } from "@/components/cms/editor-shell";
import { Field, FormSection } from "@/components/cms/form-section";
import { MediaField } from "@/components/cms/media-field";
import type { PickedMedia } from "@/components/cms/media-picker";
import { PreviewButton } from "@/components/cms/preview-dialog";
import { SlugField } from "@/components/cms/slug-field";
import { CONTENT_STATUS_DISPLAY } from "@/components/cms/status-badge";
import { StringListField } from "@/components/cms/string-list-field";
import { useEditorForm } from "@/components/cms/use-editor-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  $setProgramStatus,
  $updateProgram,
  type ProgramDetail,
  programQueryOptions
} from "@/features/corporate-trainings/functions";
import { buildProgramRowPreview, type PreviewContent } from "@/features/preview/model";
import type { ContentStatus } from "@/features/shared/content-status";
import { errorMessage } from "@/features/shared/error-message";

export const Route = createFileRoute("/_app/content/corporate-trainings/$id")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(programQueryOptions(params.id)),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.program.title ?? "Program" }] }),
  component: ProgramEditorPage
});

type ProgramForm = {
  title: string;
  slug: string;
  summary: string;
  image: PickedMedia | null;
  usefulFor: string[];
};

function toForm(detail: ProgramDetail): ProgramForm {
  const { program } = detail;
  return {
    title: program.title,
    slug: program.slug,
    summary: program.summary,
    image: detail.image,
    usefulFor: program.usefulFor
  };
}

function toSaveInput(form: ProgramForm) {
  const { image, ...values } = form;
  return {
    ...values,
    imageMediaId: image?.id ?? null
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

function ProgramEditorPage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(programQueryOptions(id));
  return <ProgramEditor key={data.program.updatedAt.toString()} detail={data} />;
}

function ProgramEditor({ detail }: { detail: ProgramDetail }) {
  const queryClient = useQueryClient();
  const { program } = detail;
  const { values, setField, isDirty, markSaved } = useEditorForm(toForm(detail));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["programs"] });

  const save = useMutation({
    mutationFn: () => $updateProgram({ data: { id: program.id, values: toSaveInput(values) } }),
    onSuccess: async () => {
      markSaved();
      toast.success("Program saved.");
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const setStatus = useMutation({
    mutationFn: (status: ContentStatus) => $setProgramStatus({ data: { id: program.id, status } }),
    onSuccess: async () => {
      toast.success("Status updated.");
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const statusActions: StatusAction[] = STATUS_ACTION_LABELS[program.status].map((action) => ({
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
          <BackLink>All programs</BackLink>
        </Link>
      }
      status={CONTENT_STATUS_DISPLAY[program.status]}
      statusActions={statusActions}
      isLive={program.status === "published"}
      lastEdited={{ name: detail.updatedByName, at: program.updatedAt }}
      isSaving={save.isPending}
      isDirty={isDirty}
      onSave={() => save.mutate()}
      preview={<PreviewButton content={previewContent} />}
      aside={
        <FormSection title="Card image">
          <MediaField value={values.image} onChange={(media) => setField("image", media)} />
        </FormSection>
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
        <Field
          label="Slug"
          htmlFor="slug"
          hint="Used in the Inquire link, e.g. /corporate-training?program=leadership"
        >
          <SlugField id="slug" title={values.title} value={values.slug} onChange={setSlug} />
        </Field>
        <Field
          label="Summary"
          htmlFor="summary"
          hint="One sentence. Shows on the card on desktop until a visitor hovers it."
        >
          <Textarea
            id="summary"
            rows={2}
            value={values.summary}
            onChange={(event) => setField("summary", event.target.value)}
          />
        </Field>
      </FormSection>

      <FormSection title="Useful for" description="Who the program is for. Shows on the card.">
        <StringListField
          value={values.usefulFor}
          onChange={(list) => setField("usefulFor", list)}
          addLabel="Add item"
        />
      </FormSection>
    </EditorShell>
  );
}
