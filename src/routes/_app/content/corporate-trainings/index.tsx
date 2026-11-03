import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Briefcase, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { ContentListPage, EmptyState, FilterTabs } from "@/components/cms/content-list-page";
import { Field, FormErrorList } from "@/components/cms/form-section";
import { SortableListSkeleton } from "@/components/cms/list-skeletons";
import { SortableList } from "@/components/cms/sortable-list";
import { CONTENT_STATUS_DISPLAY, StatusBadge } from "@/components/cms/status-badge";
import { useFormErrors } from "@/components/cms/use-form-errors";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  $createProgram,
  $reorderPrograms,
  type ProgramListItem,
  programsQueryOptions
} from "@/features/corporate-trainings/functions";
import type { statusFilterSchema } from "@/features/corporate-trainings/schemas";
import { errorMessage } from "@/features/shared/error-message";

const TITLE_FIELDS = ["title"];

export const Route = createFileRoute("/_app/content/corporate-trainings/")({
  head: () => ({ meta: [{ title: "Corporate trainings" }] }),
  component: ProgramsPage
});

type StatusFilter = z.infer<typeof statusFilterSchema>;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "All but archived" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" }
];

function ProgramsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("active");
  const listOptions = programsQueryOptions({ status });
  const programs = useQuery(listOptions);
  const isOrderable = status === "active";

  const reorderPrograms = useMutation({
    mutationFn: (ids: string[]) => $reorderPrograms({ data: { ids } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["programs"] }),
    onError: (error) => toast.error(errorMessage(error))
  });

  const handleReorder = (ordered: ProgramListItem[]) => {
    queryClient.setQueryData(listOptions.queryKey, ordered);
    reorderPrograms.mutate(ordered.map((program) => program.id));
  };

  return (
    <ContentListPage
      title="Corporate trainings"
      description={
        isOrderable
          ? "The in-house programs on the corporate training page. Drag to set the card order."
          : "The in-house programs on the corporate training page."
      }
      action={<NewProgramDialog />}
      filters={
        <FilterTabs label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      }
    >
      {programs.isPending ? (
        <SortableListSkeleton label="Loading programs…" />
      ) : programs.data?.length === 0 ? (
        <EmptyState icon={Briefcase}>No programs yet.</EmptyState>
      ) : (
        <SortableList
          items={programs.data ?? []}
          getId={(program) => program.id}
          onReorder={handleReorder}
          disabled={!isOrderable}
          renderItem={(program) => <ProgramRow program={program} />}
        />
      )}
    </ContentListPage>
  );
}

function ProgramRow({ program }: { program: ProgramListItem }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card px-4 py-3 shadow-xs">
      <Link
        to="/content/corporate-trainings/$id"
        params={{ id: program.id }}
        className="min-w-0 flex-1 truncate font-semibold hover:text-brand"
      >
        {program.title}
      </Link>
      <StatusBadge display={CONTENT_STATUS_DISPLAY[program.status]} />
      <span className="hidden w-24 text-right text-sm text-muted-foreground sm:inline">
        {new Date(program.updatedAt).toLocaleDateString()}
      </span>
    </div>
  );
}

function NewProgramDialog() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const { fieldErrors, generalErrors, showErrors, clearFieldErrors, clearErrors } =
    useFormErrors(TITLE_FIELDS);

  const create = useMutation({
    mutationFn: () => $createProgram({ data: { title } }),
    onSuccess: async ({ id }) => {
      setIsOpen(false);
      setTitle("");
      await navigate({ to: "/content/corporate-trainings/$id", params: { id } });
    },
    onError: showErrors
  });

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        clearErrors();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus />
          New program
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <DialogHeader>
            <DialogTitle>New program</DialogTitle>
          </DialogHeader>
          <Field label="Title" htmlFor="new-program-title" errors={fieldErrors.title}>
            <Input
              id="new-program-title"
              required
              placeholder="e.g. Leadership Training & Development"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                clearFieldErrors("title");
              }}
            />
          </Field>
          <FormErrorList messages={generalErrors} />
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              Create draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
