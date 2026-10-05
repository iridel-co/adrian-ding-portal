import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, ArchiveRestore } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MediaDropzone } from "@/components/cms/media-dropzone";
import { useMediaUploads } from "@/components/cms/use-media-uploads";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  $archiveMedia,
  $restoreMedia,
  $updateMediaAlt,
  type MediaItem,
  mediaListQueryOptions
} from "@/features/media/functions";
import { errorMessage } from "@/features/shared/error-message";

export const Route = createFileRoute("/_app/content/media")({
  head: () => ({ meta: [{ title: "Media" }] }),
  component: MediaPage
});

const BYTES_PER_KB = 1024;

function formatSize(bytes: number) {
  const kilobytes = bytes / BYTES_PER_KB;
  if (kilobytes < BYTES_PER_KB) return `${Math.round(kilobytes)} KB`;
  return `${(kilobytes / BYTES_PER_KB).toFixed(1)} MB`;
}

function MediaPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);

  const library = useQuery(mediaListQueryOptions({ search, includeArchived }));
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["media"] });

  const { uploads, addFiles, retry } = useMediaUploads({ onUploaded: refresh });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8">
      <div>
        <h1 className="font-display text-4xl">Media</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every image used on the site. Each one needs a short description for screen readers.
        </p>
      </div>

      <MediaDropzone uploads={uploads} onFiles={addFiles} onRetry={retry} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          className="sm:max-w-sm"
          placeholder="Search by file name or description"
          aria-label="Search images"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id="show-archived"
            checked={includeArchived}
            onCheckedChange={(checked) => setIncludeArchived(checked === true)}
          />
          <Label htmlFor="show-archived">Show archived</Label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {library.data?.map((item) => (
          <MediaCard key={item.id} item={item} onChanged={refresh} />
        ))}
      </div>
      {library.data?.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">No images yet.</p>
      )}
    </div>
  );
}

function MediaCard({ item, onChanged }: { item: MediaItem; onChanged: () => Promise<void> }) {
  const [alt, setAlt] = useState(item.alt);
  const isArchived = item.archivedAt !== null;

  const saveAlt = useMutation({
    mutationFn: () => $updateMediaAlt({ data: { id: item.id, alt } }),
    onSuccess: async () => {
      toast.success("Description saved.");
      await onChanged();
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  const toggleArchive = useMutation({
    mutationFn: () =>
      isArchived
        ? $restoreMedia({ data: { id: item.id } })
        : $archiveMedia({ data: { id: item.id } }),
    onSuccess: async () => {
      toast.success(isArchived ? "Image restored." : "Image archived.");
      await onChanged();
    },
    onError: (error) => toast.error(errorMessage(error))
  });

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border">
      <div className="aspect-video bg-muted">
        <img src={item.url} alt={item.alt} className="size-full object-contain" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium" title={item.fileName}>
              {item.fileName}
            </div>
            <div className="text-xs text-muted-foreground">
              {formatSize(item.sizeBytes)}
              {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
            </div>
          </div>
          {isArchived ? (
            <Badge variant="outline">Archived</Badge>
          ) : (
            <Badge variant={item.usages.length > 0 ? "secondary" : "outline"}>
              Used {item.usages.length}×
            </Badge>
          )}
        </div>

        <Input
          aria-label={`Description of ${item.fileName}`}
          placeholder="Add a description"
          aria-invalid={!alt.trim() || undefined}
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          onBlur={() => {
            if (alt.trim() !== item.alt) saveAlt.mutate();
          }}
        />
        {item.usages.length > 0 && (
          <p className="text-xs text-muted-foreground">
            In: {item.usages.map((usage) => usage.label).join(", ")}
          </p>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-auto self-start"
          disabled={toggleArchive.isPending}
          onClick={() => toggleArchive.mutate()}
        >
          {isArchived ? <ArchiveRestore /> : <Archive />}
          {isArchived ? "Restore" : "Archive"}
        </Button>
      </div>
    </div>
  );
}
