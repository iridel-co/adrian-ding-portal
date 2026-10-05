import { useMutation, useMutationState, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { SortableList } from "@/components/cms/sortable-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  $archiveTerm,
  $createTerm,
  $renameTerm,
  $reorderTerms,
  $restoreTerm,
  type TaxonomyKind,
  type TaxonomyTerm,
  termsQueryOptions
} from "@/lib/cms/taxonomy.functions";
import { errorMessage } from "@/lib/cms/error-message";

type TermsManagerProps = {
  kind: TaxonomyKind;
  title: string;
  description: string;
  itemLabel: string;
  placeholder: string;
};

/* Add, rename, reorder, archive and restore the terms of one managed list. */
export function TermsManager({
  kind,
  title,
  description,
  itemLabel,
  placeholder
}: TermsManagerProps) {
  const queryClient = useQueryClient();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [name, setName] = useState("");

  const terms = useQuery(termsQueryOptions({ kind, includeArchived }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["taxonomy", kind] });
  const onError = (error: Error) => toast.error(errorMessage(error));

  const activeTerms = terms.data?.filter((term) => term.archivedAt === null) ?? [];
  const archivedTerms = terms.data?.filter((term) => term.archivedAt !== null) ?? [];

  const createKey = ["taxonomy", kind, "create"];
  const savingNames = useMutationState({
    filters: { mutationKey: createKey, status: "pending" },
    select: (mutation) => String(mutation.state.variables)
  });

  const create = useMutation({
    mutationKey: createKey,
    mutationFn: (termName: string) => $createTerm({ data: { kind, name: termName } }),
    scope: { id: `taxonomy-create-${kind}` },
    onSuccess: refresh,
    onError: (error, termName) => {
      setName((current) => current || termName);
      onError(error);
    }
  });

  const reorderTerms = useMutation({
    mutationFn: (ids: string[]) => $reorderTerms({ data: { kind, ids } }),
    onSettled: refresh,
    onError
  });

  const handleReorder = (ordered: TaxonomyTerm[]) => {
    queryClient.setQueryData(termsQueryOptions({ kind, includeArchived }).queryKey, [
      ...ordered,
      ...archivedTerms
    ]);
    reorderTerms.mutate(ordered.map((term) => term.id));
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <Card>
        <CardHeader>
          <CardDescription>Drag to set the order they show on the site.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const termName = name.trim();
              if (!termName) return;

              setName("");
              create.mutate(termName);
            }}
          >
            <Input
              required
              aria-label={`New ${itemLabel}`}
              placeholder={placeholder}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit">
              Add {itemLabel}
            </Button>
          </form>

          <SortableList
            items={activeTerms}
            getId={(term) => term.id}
            onReorder={handleReorder}
            renderItem={(term) => <TermRow term={term} onChanged={refresh} />}
          />
          {savingNames.length > 0 && (
            <ul className="flex flex-col gap-2 pl-8">
              {savingNames.map((savingName, index) => (
                <li key={`${savingName}-${index}`}>
                  <Input value={savingName} disabled aria-label={`Saving ${savingName}`} />
                </li>
              ))}
            </ul>
          )}
          {activeTerms.length === 0 && savingNames.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">Nothing here yet.</p>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id={`${kind}-show-archived`}
              checked={includeArchived}
              onCheckedChange={(checked) => setIncludeArchived(checked === true)}
            />
            <Label htmlFor={`${kind}-show-archived`}>Show archived</Label>
          </div>
          {includeArchived && (
            <ul className="flex flex-col gap-2">
              {archivedTerms.map((term) => (
                <li key={term.id}>
                  <TermRow term={term} onChanged={refresh} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TermRow({ term, onChanged }: { term: TaxonomyTerm; onChanged: () => Promise<void> }) {
  const [name, setName] = useState(term.name);
  const isArchived = term.archivedAt !== null;
  const onError = (error: Error) => {
    setName(term.name);
    toast.error(errorMessage(error));
  };

  const rename = useMutation({
    mutationFn: () => $renameTerm({ data: { id: term.id, name } }),
    onSuccess: onChanged,
    onError
  });

  const toggleArchive = useMutation({
    mutationFn: () =>
      isArchived
        ? $restoreTerm({ data: { id: term.id } })
        : $archiveTerm({ data: { id: term.id } }),
    onSuccess: onChanged,
    onError: (error) => toast.error(errorMessage(error))
  });

  return (
    <div className="flex items-center gap-2">
      <Input
        aria-label={`Name of ${term.name}`}
        value={name}
        disabled={isArchived}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (name.trim() && name.trim() !== term.name) rename.mutate();
          else setName(term.name);
        }}
      />
      {isArchived && <Badge variant="secondary">Archived</Badge>}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={isArchived ? `Restore ${term.name}` : `Archive ${term.name}`}
        disabled={toggleArchive.isPending}
        onClick={() => toggleArchive.mutate()}
      >
        {isArchived ? <ArchiveRestore /> : <Archive />}
      </Button>
    </div>
  );
}
