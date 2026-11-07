import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Images } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/cms/content-list-page";
import { Field } from "@/components/cms/form-section";
import { MediaGridSkeleton } from "@/components/cms/list-skeletons";
import { MediaDropzone } from "@/components/cms/media-dropzone";
import { NO_FIELDS, useFormErrors } from "@/components/cms/use-form-errors";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { $updateMediaAlt, mediaListQueryOptions } from "@/features/media/functions";

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

const PICKER_GRID_CLASS = "grid max-h-80 auto-rows-max grid-cols-3 content-start gap-2 overflow-y-auto sm:grid-cols-4";
const ALT_MISSING_MESSAGE = "Describe the image before you use it.";

type PickerTab = "library" | "upload";

export function MediaPicker({ open, onOpenChange, onPick }: MediaPickerProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<PickerTab>("library");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PickedMedia | null>(null);
  const [alt, setAlt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { generalErrors, showErrors, clearErrors } = useFormErrors(NO_FIELDS);

  const library = useQuery({ ...mediaListQueryOptions({ search }), enabled: open });

  const select = (media: PickedMedia) => {
    setSelected(media);
    setAlt(media.alt);
    clearErrors();
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
    clearErrors();
    onOpenChange(false);
  };

  const confirm = async () => {
    if (!selected) return;

    const trimmedAlt = alt.trim();
    if (!trimmedAlt) {
      showErrors(new Error(ALT_MISSING_MESSAGE));
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
      showErrors(error);
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
            {library.isPending ? (
              <MediaGridSkeleton
                label="Loading images…"
                className={PICKER_GRID_CLASS}
                cardClassName="aspect-square w-full"
              />
            ) : (
              <div className={PICKER_GRID_CLASS}>
                {library.data?.map((item) => {
                  const isSelected = selected?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => select({ id: item.id, url: item.url, alt: item.alt })}
                      data-selected={isSelected || undefined}
                      className="relative block aspect-square w-full overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-selected:ring-2 data-selected:ring-primary"
                    >
                      <img
                        src={item.url}
                        alt={item.alt}
                        className="absolute inset-0 size-full object-contain"
                      />
                      {isSelected && (
                        <Check className="absolute top-1.5 right-1.5 size-5 rounded-full bg-primary p-0.5 text-primary-foreground" />
                      )}
                    </button>
                  );
                })}
                {library.data?.length === 0 && (
                  <EmptyState icon={Images} className="col-span-full py-8 shadow-none">
                    No images found.
                  </EmptyState>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="upload">
            <MediaDropzone uploads={uploads} onFiles={addFiles} onRetry={retry} />
          </TabsContent>
        </Tabs>

        {selected && (
          <Field
            label="Image description (alt text)"
            htmlFor="media-picker-alt"
            errors={generalErrors}
          >
            <Input
              id="media-picker-alt"
              placeholder="e.g. Adrian leading a workshop in Cebu"
              value={alt}
              onChange={(event) => {
                setAlt(event.target.value);
                clearErrors();
              }}
            />
          </Field>
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
