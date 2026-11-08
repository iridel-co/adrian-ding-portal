import { ImageIcon, X } from "lucide-react";
import { cn } from "cn";
import { useState } from "react";

import { ImageFocusPicker } from "@/components/cms/image-focus-picker";
import { MediaPicker, type PickedMedia } from "@/components/cms/media-picker";
import { Button } from "@/components/ui/button";
import type { ImageFocus } from "@/features/shared/image-focus";

type MediaFieldProps = {
  value: PickedMedia | null;
  onChange: (media: PickedMedia | null) => void;
  /* Tailwind aspect class for the preview, e.g. "aspect-video" or "aspect-square". */
  aspectClassName?: string;
  /* Pass both to let the editor drag a focus dot onto the photo instead of a plain preview. */
  focus?: ImageFocus;
  onFocusChange?: (focus: ImageFocus) => void;
};

export function MediaField({
  value,
  onChange,
  aspectClassName = "aspect-video",
  focus,
  onFocusChange
}: MediaFieldProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const canFocus = focus !== undefined && onFocusChange !== undefined;

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div
          className={cn(
            "relative",
            !canFocus && "overflow-hidden rounded-md border bg-muted",
            !canFocus && aspectClassName
          )}
        >
          {focus && onFocusChange ? (
            <ImageFocusPicker image={value} value={focus} onChange={onFocusChange} />
          ) : (
            <img src={value.url} alt={value.alt} className="size-full object-contain" />
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Remove image"
            className="absolute top-2 right-2"
            onClick={() => onChange(null)}
          >
            <X />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsPickerOpen(true)}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed text-sm text-muted-foreground hover:bg-muted/50",
            aspectClassName
          )}
        >
          <ImageIcon className="size-6" />
          Choose image
        </button>
      )}
      {value && (
        <Button type="button" variant="outline" size="sm" onClick={() => setIsPickerOpen(true)}>
          Change image
        </Button>
      )}
      <MediaPicker open={isPickerOpen} onOpenChange={setIsPickerOpen} onPick={onChange} />
    </div>
  );
}
