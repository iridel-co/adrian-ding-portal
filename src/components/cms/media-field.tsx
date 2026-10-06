import { ImageIcon, X } from "lucide-react";
import { cn } from "cn";
import { useState } from "react";

import { MediaPicker, type PickedMedia } from "@/components/cms/media-picker";
import { Button } from "@/components/ui/button";

type MediaFieldProps = {
  value: PickedMedia | null;
  onChange: (media: PickedMedia | null) => void;
  /* Tailwind aspect class for the preview, e.g. "aspect-video" or "aspect-square". */
  aspectClassName?: string;
};

export function MediaField({ value, onChange, aspectClassName = "aspect-video" }: MediaFieldProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      {value ? (
        <div className={cn("relative overflow-hidden rounded-md border bg-muted", aspectClassName)}>
          <img src={value.url} alt={value.alt} className="size-full object-contain" />
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
