import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { ContentListPage, EmptyState, FilterSelect } from "@/components/cms/content-list-page";
import { Field, FormErrorList } from "@/components/cms/form-section";
import { CONTENT_STATUS_DISPLAY, StatusBadge } from "@/components/cms/status-badge";
import { useFormErrors } from "@/components/cms/use-form-errors";
import { ReadState } from "@/components/table/read-state";
import { nextSort } from "@/components/table/sort-search";
import { SortableTableHead } from "@/components/table/sortable-table-head";
import { TableSkeleton } from "@/components/table/table-skeleton";
import { TablePagination } from "@/components/table/table-pagination";
import { Badge } from "@/components/ui/badge";
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
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { errorMessage } from "@/features/shared/error-message";
import { formatDate } from "@/features/shared/format";
import { paginationSearchSchema, sortDirection } from "@/features/shared/pagination";
import { $createWorkshop, workshopsQueryOptions } from "@/features/workshops/functions";
import { statusFilterSchema, workshopListSort } from "@/features/workshops/schemas";

const TITLE_FIELDS = ["title"];

const searchSchema = z
  .object({
    status: statusFilterSchema.catch("active").default("active"),
    search: z.string().trim().catch("").default(""),
    sort: workshopListSort.catch("updatedAt"),
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
  const updateSearch = (changes: Partial<WorkshopSearch>) =>
    void navigate({ search: { ...search, ...changes } });

  return (
    <ContentListPage
      title="Workshops"
      description="The courses Adrian teaches. Each one can run on many dates."
      action={<NewWorkshopDialog />}
      filters={
        <>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              updateSearch({ search: text, offset: 0 });
            }}
          >
            <Input
              className="sm:max-w-xs"
              placeholder="Search by title"
              aria-label="Search workshops"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <Button variant="outline" type="submit">
              Search
            </Button>
          </form>
          <FilterSelect
            label="Status"
            value={search.status}
            options={STATUS_OPTIONS}
            onChange={(status) => updateSearch({ status, offset: 0 })}
          />
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
        <>
          {workshops.data.items.length === 0 ? (
            <EmptyState icon={BookOpen}>No workshops match these filters.</EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {COLUMNS.map((column) => (
                    <WorkshopHead key={column.label} column={column} search={search} />
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {workshops.data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-normal">
                      <Link
                        to="/content/workshops/$id"
                        params={{ id: item.id }}
                        className="font-medium underline underline-offset-4"
                      >
                        {item.title}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.courseCode ?? "-"}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
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
        </>
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
        <Button>
          <Plus />
          New workshop
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
            <DialogTitle>New workshop</DialogTitle>
          </DialogHeader>
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
