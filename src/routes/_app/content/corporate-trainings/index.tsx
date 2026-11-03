import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Briefcase, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";

import { ContentListPage, EmptyState, FilterTabs } from "@/components/cms/content-list-page";
import { ContentBulkActions, ContentRowActions } from "@/components/cms/content-status-actions";
import { Field, FormErrorList } from "@/components/cms/form-section";
import { SortableTableBody } from "@/components/cms/sortable-list";
import { CONTENT_STATUS_DISPLAY, StatusBadge } from "@/components/cms/status-badge";
import { useFormErrors } from "@/components/cms/use-form-errors";
import { ReadState } from "@/components/table/read-state";
import { ActionsHead, RowActions, SelectAllHead, SelectCell, useRowSelection } from "@/components/table/row-actions";
import { SelectionBar } from "@/components/table/selection-bar";
import { TableCard } from "@/components/table/table-card";
import { TableSkeleton } from "@/components/table/table-skeleton";
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
  Table,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableRowLinkClass
} from "@/components/ui/table";
import {
  $createProgram,
  $reorderPrograms,
  $setProgramStatus,
  type ProgramListItem,
  programsQueryOptions
} from "@/features/corporate-trainings/functions";
import type { statusFilterSchema } from "@/features/corporate-trainings/schemas";
import { errorMessage } from "@/features/shared/error-message";
import type { ContentStatus } from "@/features/shared/content-status";

const TITLE_FIELDS = ["title"];

export const Route = createFileRoute("/_app/content/corporate-trainings/")({
  head: () => ({ meta: [{ title: "Corporate trainings" }] }),
  component: ProgramsPage
});

type StatusFilter = z.infer<typeof statusFilterSchema>;

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" }
];

const COLUMNS = [
  { label: "Title" },
  { label: "Status" },
  { label: "Updated", className: "hidden sm:table-cell" }
];

function ProgramsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("active");
  const listOptions = programsQueryOptions({ status });
  const programs = useQuery(listOptions);
  const isOrderable = status === "active";
  const columns = isOrderable ? [{ label: "", className: "w-10" }, ...COLUMNS] : COLUMNS;
  const selection = useRowSelection(programs.data ?? []);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["programs"] });
  const statusProps = {
    noun: "program",
    setStatus: (id: string, status: ContentStatus) => $setProgramStatus({ data: { id, status } }),
    onDone: refresh
  };

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
          ? "The in-house programs on the corporate training page. Drag rows to set the card order."
          : "The in-house programs on the corporate training page."
      }
      action={<NewProgramDialog />}
      filters={
        <FilterTabs label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
      }
    >
      <ReadState
        pending={programs.isPending}
        error={programs.error}
        retry={() => void programs.refetch()}
        loadingMessage="Loading programs…"
        skeleton={<TableSkeleton columns={columns} />}
        errorMessage={errorMessage}
      />
      {programs.data &&
        (programs.data.length === 0 ? (
          <EmptyState icon={Briefcase}>
            {isOrderable ? "No programs yet." : "No programs match this filter."}
          </EmptyState>
        ) : (
          <TableCard>
            {selection.selected.length > 0 && (
              <SelectionBar count={selection.selected.length} total={selection.total} onSelectAll={selection.selectAll} onClear={selection.clear}>
                <ContentBulkActions items={selection.selected} {...statusProps} onDone={() => { selection.clear(); refresh(); }} />
              </SelectionBar>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  {isOrderable && <TableHead className="w-10" />}
                  <SelectAllHead selection={selection} label="Select all programs" />
                  {COLUMNS.map((column) => (
                    <TableHead key={column.label} className={column.className}>
                      {column.label}
                    </TableHead>
                  ))}
                  <ActionsHead />
                </TableRow>
              </TableHeader>
              <SortableTableBody
                items={programs.data}
                getId={(program) => program.id}
                onReorder={handleReorder}
                disabled={!isOrderable}
                renderRow={(program) => (
                  <>
                    <SelectCell checked={selection.isSelected(program.id)} onChange={(checked) => selection.toggle(program.id, checked)}
                      label={`Select ${program.title}`} />
                    <ProgramCells program={program} />
                    <RowActions>
                      <ContentRowActions item={program} {...statusProps} />
                    </RowActions>
                  </>
                )}
              />
            </Table>
          </TableCard>
        ))}
    </ContentListPage>
  );
}

function ProgramCells({ program }: { program: ProgramListItem }) {
  return (
    <>
      <TableCell className="whitespace-normal">
        <Link
          to="/content/corporate-trainings/$id"
          params={{ id: program.id }}
          className={tableRowLinkClass}
        >
          {program.title}
        </Link>
      </TableCell>
      <TableCell>
        <StatusBadge display={CONTENT_STATUS_DISPLAY[program.status]} />
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        {new Date(program.updatedAt).toLocaleDateString()}
      </TableCell>
    </>
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
        <Button variant="brand">
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
