import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, type LucideIcon, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ContentListPage, EmptyState, FilterTabs } from "@/components/cms/content-list-page";
import { CreateDialogContent } from "@/components/cms/create-dialog";
import { Field, FieldErrors } from "@/components/cms/form-section";
import { SortableTableBody } from "@/components/cms/sortable-list";
import { NO_FIELDS, useFormErrors } from "@/components/cms/use-form-errors";
import { ReadState } from "@/components/table/read-state";
import { TableSkeleton } from "@/components/table/table-skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  $archiveTerm,
  $createTerm,
  $renameTerm,
  $reorderTerms,
  $restoreTerm,
  type TaxonomyKind,
  type TaxonomyTerm,
  termsQueryOptions
} from "@/features/taxonomy/functions";
import { errorMessage } from "@/features/shared/error-message";

const NAME_FIELDS = ["name"];

type View = "active" | "archived";

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" }
];

const ACTIVE_COLUMNS = [
  { label: "", className: "w-10" },
  { label: "Name" },
  { label: "Added", className: "hidden sm:table-cell" },
  { label: "Actions", className: "text-right" }
];

const ARCHIVED_COLUMNS = [
  { label: "Name" },
  { label: "Archived", className: "hidden sm:table-cell" },
  { label: "Actions", className: "text-right" }
];

type TermsManagerProps = {
  kind: TaxonomyKind;
  title: string;
  description: string;
  itemLabel: string;
  placeholder: string;
  icon: LucideIcon;
};

/* A list page for a set of filter terms, such as workshop tags: add, rename, archive and drag to order. */
export function TermsManager({
  kind,
  title,
  description,
  itemLabel,
  placeholder,
  icon
}: TermsManagerProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("active");
  const isActive = view === "active";
  const listOptions = termsQueryOptions({ kind, includeArchived: !isActive });
  const terms = useQuery(listOptions);
  const columns = isActive ? ACTIVE_COLUMNS : ARCHIVED_COLUMNS;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["taxonomy", kind] });
  const shownTerms = terms.data?.filter((term) => (term.archivedAt === null) === isActive);

  const reorderTerms = useMutation({
    mutationFn: (ids: string[]) => $reorderTerms({ data: { kind, ids } }),
    onSettled: refresh,
    onError: (error) => toast.error(errorMessage(error))
  });

  const handleReorder = (ordered: TaxonomyTerm[]) => {
    queryClient.setQueryData(listOptions.queryKey, ordered);
    reorderTerms.mutate(ordered.map((term) => term.id));
  };

  return (
    <ContentListPage
      title={title}
      description={isActive ? `${description} Drag rows to set the order they show on the site.` : description}
      action={
        <NewTermDialog
          kind={kind}
          itemLabel={itemLabel}
          placeholder={placeholder}
          icon={icon}
          description={description}
          onCreated={refresh}
        />
      }
      filters={<FilterTabs label="Show" value={view} options={VIEW_OPTIONS} onChange={setView} />}
    >
      <ReadState
        pending={terms.isPending}
        error={terms.error}
        retry={() => void terms.refetch()}
        loadingMessage={`Loading ${title.toLowerCase()}…`}
        skeleton={<TableSkeleton columns={columns} />}
        errorMessage={errorMessage}
      />
      {shownTerms &&
        (shownTerms.length === 0 ? (
          <EmptyState icon={icon}>
            {isActive ? `Nothing here yet. Add your first ${itemLabel}.` : "Nothing archived."}
          </EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.label} className={column.className}>
                    {column.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <SortableTableBody
              items={shownTerms}
              getId={(term) => term.id}
              onReorder={handleReorder}
              disabled={!isActive}
              renderRow={(term) => <TermCells term={term} onChanged={refresh} />}
            />
          </Table>
        ))}
    </ContentListPage>
  );
}

function TermCells({ term, onChanged }: { term: TaxonomyTerm; onChanged: () => Promise<void> }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(term.name);
  const isArchived = term.archivedAt !== null;
  const { generalErrors, showErrors, clearErrors } = useFormErrors(NO_FIELDS);

  const stopEditing = () => {
    setIsEditing(false);
    setName(term.name);
    clearErrors();
  };

  const rename = useMutation({
    mutationFn: () => $renameTerm({ data: { id: term.id, name: name.trim() } }),
    onSuccess: async () => {
      setIsEditing(false);
      await onChanged();
    },
    onError: showErrors
  });

  const save = () => {
    if (rename.isPending) return;
    if (!name.trim() || name.trim() === term.name) stopEditing();
    else rename.mutate();
  };

  const toggleArchive = useMutation({
    mutationFn: () =>
      isArchived
        ? $restoreTerm({ data: { id: term.id } })
        : $archiveTerm({ data: { id: term.id } }),
    onSuccess: onChanged,
    onError: (error) => toast.error(errorMessage(error))
  });

  return (
    <>
      <TableCell className="whitespace-normal">
        {isEditing ? (
          <form
            className="flex max-w-sm flex-col gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <Input
              autoFocus
              aria-label={`New name for ${term.name}`}
              value={name}
              disabled={rename.isPending}
              onChange={(event) => {
                setName(event.target.value);
                clearErrors();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") stopEditing();
              }}
              onBlur={save}
            />
            {generalErrors.length > 0 && <FieldErrors errors={generalErrors} />}
          </form>
        ) : (
          <span className={isArchived ? "text-muted-foreground" : "font-medium"}>{term.name}</span>
        )}
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        {new Date(term.archivedAt ?? term.createdAt).toLocaleDateString()}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          {!isArchived && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Rename ${term.name}`}
              disabled={isEditing}
              onClick={() => setIsEditing(true)}
            >
              <Pencil />
              <span className="hidden sm:inline">Rename</span>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={isArchived ? `Restore ${term.name}` : `Archive ${term.name}`}
            disabled={toggleArchive.isPending}
            onClick={() => toggleArchive.mutate()}
          >
            {isArchived ? <ArchiveRestore /> : <Archive />}
            <span className="hidden sm:inline">{isArchived ? "Restore" : "Archive"}</span>
          </Button>
        </div>
      </TableCell>
    </>
  );
}

type NewTermDialogProps = {
  kind: TaxonomyKind;
  itemLabel: string;
  placeholder: string;
  icon: LucideIcon;
  description: string;
  onCreated: () => Promise<void>;
};

function NewTermDialog({ kind, itemLabel, placeholder, icon, description, onCreated }: NewTermDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const { fieldErrors, generalErrors, showErrors, clearFieldErrors, clearErrors } =
    useFormErrors(NAME_FIELDS);

  const create = useMutation({
    mutationFn: () => $createTerm({ data: { kind, name: name.trim() } }),
    onSuccess: async () => {
      setIsOpen(false);
      setName("");
      await onCreated();
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
          New {itemLabel}
        </Button>
      </DialogTrigger>
      <CreateDialogContent
        icon={icon}
        title={`New ${itemLabel}`}
        description={description}
        submitLabel={`Add ${itemLabel}`}
        isPending={create.isPending}
        errors={generalErrors}
        onSubmit={() => create.mutate()}
      >
        <Field label="Name" htmlFor={`new-${kind}-name`} errors={fieldErrors.name}>
          <Input
            id={`new-${kind}-name`}
            required
            placeholder={placeholder}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearFieldErrors("name");
            }}
          />
        </Field>
      </CreateDialogContent>
    </Dialog>
  );
}
