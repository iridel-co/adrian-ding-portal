import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { ContentListPage, EmptyState, FilterTabs, SearchInput } from "@/components/cms/content-list-page";
import { ContentBulkActions, ContentRowActions } from "@/components/cms/content-status-actions";
import { CreateDialogContent } from "@/components/cms/create-dialog";
import { Field } from "@/components/cms/form-section";
import { CONTENT_STATUS_DISPLAY, StatusBadge } from "@/components/cms/status-badge";
import { useFormErrors } from "@/components/cms/use-form-errors";
import { ReadState } from "@/components/table/read-state";
import { ActionsHead, RowActions, SelectAllHead, SelectCell, useRowSelection } from "@/components/table/row-actions";
import { SelectionBar } from "@/components/table/selection-bar";
import { nextSort } from "@/components/table/sort-search";
import { SortableTableHead } from "@/components/table/sortable-table-head";
import { TableSkeleton } from "@/components/table/table-skeleton";
import { TableCard } from "@/components/table/table-card";
import { TablePagination } from "@/components/table/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  tableRowLinkClass
} from "@/components/ui/table";
import { errorMessage } from "@/features/shared/error-message";
import { formatDate } from "@/features/shared/format";
import { paginationSearchSchema, sortDirection } from "@/features/shared/pagination";
import { displayCourseCode } from "@/features/workshops/course-number";
import { $createWorkshop, $setWorkshopStatus, workshopsQueryOptions } from "@/features/workshops/functions";
import type { ContentStatus } from "@/features/shared/content-status";
import { statusFilterSchema, workshopListSort } from "@/features/workshops/schemas";

const TITLE_FIELDS = ["title"];

const searchSchema = z
  .object({
    status: statusFilterSchema.catch("active").default("active"),
    search: z.string().trim().catch("").default(""),
    sort: workshopListSort.catch("status"),
    direction: sortDirection.catch("desc")
  })
  .and(paginationSearchSchema);

type WorkshopSearch = z.output<typeof searchSchema>;
type WorkshopSort = WorkshopSearch["sort"];

export const Route = createFileRoute("/_app/content/workshops/")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Workshops" }] }),
  component: WorkshopsPage
});

type StatusFilter = WorkshopSearch["status"];

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "All but archived" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" }
];

type Column = {
  label: string;
  sort?: WorkshopSort;
  className?: string;
};

const COLUMNS: Column[] = [
  { sort: "title", label: "Title" },
  { sort: "courseCode", label: "Code" },
  { label: "Tags", className: "hidden md:table-cell" },
  { sort: "status", label: "Status" },
  { sort: "nextSessionDate", label: "Next session", className: "hidden sm:table-cell" },
  { sort: "updatedAt", label: "Updated", className: "hidden lg:table-cell" }
];

function WorkshopsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [text, setText] = useState(search.search);
  useEffect(() => setText(search.search), [search.search]);

  const workshops = useQuery(workshopsQueryOptions(search));
  const selection = useRowSelection(workshops.data?.items ?? []);
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["workshops"] });
  const statusProps = {
    noun: "workshop",
    setStatus: (id: string, status: ContentStatus) => $setWorkshopStatus({ data: { id, status } }),
    onDone: refresh
  };
  const updateSearch = (changes: Partial<WorkshopSearch>) =>
    void navigate({ search: { ...search, ...changes } });

  return (
    <ContentListPage
      title="Workshops"
      description="The courses Adrian teaches. Each one can run on many dates."
      action={<NewWorkshopDialog />}
      filters={
        <>
          <FilterTabs
            label="Status"
            value={search.status}
            options={STATUS_OPTIONS}
            onChange={(status) => updateSearch({ status, offset: 0 })}
          />
          <form
            className="sm:ml-auto"
            onSubmit={(event) => {
              event.preventDefault();
              updateSearch({ search: text, offset: 0 });
            }}
          >
            <SearchInput
              placeholder="Search by title"
              aria-label="Search workshops"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </form>
        </>
      }
    >
      <ReadState
        pending={workshops.isPending}
        error={workshops.error}
        retry={() => void workshops.refetch()}
        loadingMessage="Loading workshops…"
        skeleton={<TableSkeleton columns={COLUMNS} />}
        errorMessage={errorMessage}
      />
      {workshops.data && (
        <TableCard>
          {selection.selected.length > 0 && (
            <SelectionBar count={selection.selected.length} total={selection.total} onSelectAll={selection.selectAll} onClear={selection.clear}>
              <ContentBulkActions items={selection.selected} {...statusProps} onDone={() => { selection.clear(); refresh(); }} />
            </SelectionBar>
          )}
          {workshops.data.items.length === 0 ? (
            <EmptyState icon={BookOpen}>No workshops match these filters.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SelectAllHead selection={selection} label="Select all workshops on this page" />
                  {COLUMNS.map((column) => (
                    <WorkshopHead key={column.label} column={column} search={search} />
                  ))}
                  <ActionsHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {workshops.data.items.map((item) => (
                  <TableRow key={item.id} data-state={selection.isSelected(item.id) ? "selected" : undefined}>
                    <SelectCell checked={selection.isSelected(item.id)} onChange={(checked) => selection.toggle(item.id, checked)} label={`Select ${item.title}`} />
                    <TableCell className="whitespace-normal">
                      <Link
                        to="/content/workshops/$id"
                        params={{ id: item.id }}
                        className={tableRowLinkClass}
                      >
                        {item.title}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {item.courseCode ? displayCourseCode(item.courseCode) : "-"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <Badge key={tag} variant="neutral">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge display={CONTENT_STATUS_DISPLAY[item.status]} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {item.nextSessionDate ? formatDate(item.nextSessionDate) : "None"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {new Date(item.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <RowActions>
                      <ContentRowActions item={item} {...statusProps} />
                    </RowActions>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <TablePagination
            limit={search.limit}
            offset={search.offset}
            count={workshops.data.items.length}
            hasMore={workshops.data.hasMore}
            fetching={workshops.isFetching}
            onChange={(page) => void navigate({ search: { ...search, ...page } })}
          />
        </TableCard>
      )}
    </ContentListPage>
  );
}

type WorkshopHeadProps = {
  column: Column;
  search: WorkshopSearch;
};

function WorkshopHead({ column, search }: WorkshopHeadProps) {
  const navigate = Route.useNavigate();
  const { sort } = column;
  if (!sort) return <TableHead className={column.className}>{column.label}</TableHead>;

  return (
    <SortableTableHead
      className={column.className}
      active={search.sort === sort}
      direction={search.direction}
      onClick={() => void navigate({ search: { ...search, ...nextSort(search, sort) } })}
    >
      {column.label}
    </SortableTableHead>
  );
}

function NewWorkshopDialog() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const { fieldErrors, generalErrors, showErrors, clearFieldErrors, clearErrors } =
    useFormErrors(TITLE_FIELDS);

  const create = useMutation({
    mutationFn: () => $createWorkshop({ data: { title } }),
    onSuccess: async ({ id }) => {
      setIsOpen(false);
      setTitle("");
      await navigate({ to: "/content/workshops/$id", params: { id } });
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
          New workshop
        </Button>
      </DialogTrigger>
      <CreateDialogContent
        icon={BookOpen}
        title="New workshop"
        description="Start with a title. You can fill in the rest before you publish."
        submitLabel="Create draft"
        isPending={create.isPending}
        errors={generalErrors}
        onSubmit={() => create.mutate()}
      >
        <Field label="Title" htmlFor="new-workshop-title" errors={fieldErrors.title}>
          <Input
            id="new-workshop-title"
            required
            placeholder="e.g. Coaching for Managers"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              clearFieldErrors("title");
            }}
          />
        </Field>
      </CreateDialogContent>
    </Dialog>
  );
}
