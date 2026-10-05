import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MediaDropzone } from "@/components/cms/media-dropzone";
import { useMediaUploads } from "@/components/cms/use-media-uploads";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { $updateMediaAlt, mediaListQueryOptions } from "@/lib/cms/media.functions";
import { errorMessage } from "@/lib/cms/error-message";

export type PickedMedia = {
  id: string;
  url: string;
  alt: string;
};

type MediaPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (media: PickedMedia) => void;
};

type PickerTab = "library" | "upload";

export function MediaPicker({ open, onOpenChange, onPick }: MediaPickerProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<PickerTab>("library");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PickedMedia | null>(null);
  const [alt, setAlt] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const library = useQuery({ ...mediaListQueryOptions({ search }), enabled: open });

  const select = (media: PickedMedia) => {
    setSelected(media);
    setAlt(media.alt);
  };

  const { uploads, addFiles, retry } = useMediaUploads({
    onUploaded: async (media) => {
      await queryClient.invalidateQueries({ queryKey: ["media"] });
      select({ id: media.id, url: media.url, alt: media.alt });
      setTab("library");
    }
  });

  const close = () => {
    setSelected(null);
    setAlt("");
    onOpenChange(false);
  };

  const confirm = async () => {
    if (!selected) return;

    const trimmedAlt = alt.trim();
    if (!trimmedAlt) {
      toast.error("Describe the image before you use it.");
      return;
    }

    setIsSaving(true);
    try {
      if (trimmedAlt !== selected.alt) {
        await $updateMediaAlt({ data: { id: selected.id, alt: trimmedAlt } });
        await queryClient.invalidateQueries({ queryKey: ["media"] });
      }
      onPick({ ...selected, alt: trimmedAlt });
      close();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => (isOpen ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Choose an image</DialogTitle>
          <DialogDescription>Pick from the library or upload a new image.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(value) => setTab(value as PickerTab)}>
          <TabsList>
            <TabsTrigger value="library">Library</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="flex flex-col gap-3">
            <Input
              placeholder="Search by file name or description"
              aria-label="Search images"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {library.data?.map((item) => {
                const isSelected = selected?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => select({ id: item.id, url: item.url, alt: item.alt })}
                    data-selected={isSelected || undefined}
                    className="relative aspect-square overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-selected:ring-2 data-selected:ring-primary"
                  >
                    <img src={item.url} alt={item.alt} className="size-full object-contain" />
                    {isSelected && (
                      <Check className="absolute top-1.5 right-1.5 size-5 rounded-full bg-primary p-0.5 text-primary-foreground" />
                    )}
                  </button>
                );
              })}
              {library.data?.length === 0 && (
                <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                  No images found.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="upload">
            <MediaDropzone uploads={uploads} onFiles={addFiles} onRetry={retry} />
          </TabsContent>
        </Tabs>

        {selected && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="media-picker-alt">Image description (alt text)</Label>
            <Input
              id="media-picker-alt"
              placeholder="e.g. Adrian leading a workshop in Cebu"
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
            />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={!selected || isSaving} onClick={confirm}>
            Use image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
