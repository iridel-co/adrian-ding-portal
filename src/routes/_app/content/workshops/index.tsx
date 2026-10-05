import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ContentListPage, EmptyState, FilterSelect } from "@/components/cms/content-list-page";
import { CONTENT_STATUS_DISPLAY, StatusBadge } from "@/components/cms/status-badge";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { formatDate } from "@/lib/cms/format";
import { $createWorkshop, workshopsQueryOptions } from "@/lib/cms/workshops.functions";
import { errorMessage } from "@/lib/cms/error-message";

export const Route = createFileRoute("/_app/content/workshops/")({
  head: () => ({ meta: [{ title: "Workshops" }] }),
  component: WorkshopsPage
});

type StatusFilter = "active" | "draft" | "published" | "archived";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "All but archived" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" }
];

function WorkshopsPage() {
  const [status, setStatus] = useState<StatusFilter>("active");
  const [search, setSearch] = useState("");
  const workshops = useQuery(workshopsQueryOptions({ status, search }));

  return (
    <ContentListPage
      title="Workshops"
      description="The courses Adrian teaches. Each one can run on many dates."
      action={<NewWorkshopDialog />}
      filters={
        <>
          <Input
            className="sm:max-w-xs"
            placeholder="Search by title"
            aria-label="Search workshops"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <FilterSelect
            label="Status"
            value={status}
            options={STATUS_OPTIONS}
            onChange={setStatus}
          />
        </>
      }
    >
      {workshops.data?.length === 0 ? (
        <EmptyState>No workshops yet.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Code</TableHead>
              <TableHead className="hidden md:table-cell">Tags</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Next session</TableHead>
              <TableHead className="hidden lg:table-cell">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workshops.data?.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium whitespace-normal">
                  <Link
                    to="/content/workshops/$id"
                    params={{ id: item.id }}
                    className="hover:underline"
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
    </ContentListPage>
  );
}

function NewWorkshopDialog() {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");

  const create = useMutation({
    mutationFn: () => $createWorkshop({ data: { title } }),
    onSuccess: async ({ id }) => {
      setIsOpen(false);
      setTitle("");
      await navigate({ to: "/content/workshops/$id", params: { id } });
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-workshop-title">Title</Label>
            <Input
              id="new-workshop-title"
              required
              placeholder="e.g. Coaching for Managers"
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
