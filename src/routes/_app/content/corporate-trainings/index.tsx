import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ContentListPage, EmptyState, FilterSelect } from "@/components/cms/content-list-page";
import { SortableList } from "@/components/cms/sortable-list";
import { CONTENT_STATUS_DISPLAY, StatusBadge } from "@/components/cms/status-badge";
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
import { Label } from "@/components/ui/label";
import {
  $createProgram,
  $reorderPrograms,
  type ProgramListItem,
  programsQueryOptions
} from "@/features/corporate-trainings/functions";
import { errorMessage } from "@/features/shared/error-message";

export const Route = createFileRoute("/_app/content/corporate-trainings/")({
  head: () => ({ meta: [{ title: "Corporate trainings" }] }),
  component: ProgramsPage
});

type StatusFilter = "active" | "draft" | "published" | "archived";

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
        <FilterSelect label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      }
    >
      {programs.data?.length === 0 ? (
        <EmptyState>No programs yet.</EmptyState>
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
    <div className="flex items-center gap-4 rounded-md border px-4 py-3">
      <Link
        to="/content/corporate-trainings/$id"
        params={{ id: program.id }}
        className="min-w-0 flex-1 truncate font-medium hover:underline"
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

  const create = useMutation({
    mutationFn: () => $createProgram({ data: { title } }),
    onSuccess: async ({ id }) => {
      setIsOpen(false);
      setTitle("");
      await navigate({ to: "/content/corporate-trainings/$id", params: { id } });
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-program-title">Title</Label>
            <Input
              id="new-program-title"
              required
              placeholder="e.g. Leadership Training & Development"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
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
