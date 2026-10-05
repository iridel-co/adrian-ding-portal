import { ImageUp, RotateCw } from "lucide-react";
import { useRef, useState } from "react";

import type { MediaUpload } from "@/components/cms/use-media-uploads";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MEDIA_CONTENT_TYPES } from "@/lib/cms/media-rules";

type MediaDropzoneProps = {
  uploads: MediaUpload[];
  onFiles: (files: File[]) => void;
  onRetry: (id: string) => void;
  multiple?: boolean;
};

export function MediaDropzone({ uploads, onFiles, onRetry, multiple = true }: MediaDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          onFiles([...event.dataTransfer.files]);
        }}
        data-dragging={isDragging || undefined}
        className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50 data-dragging:border-primary data-dragging:bg-muted"
      >
        <ImageUp className="size-6" />
        <span>
          <span className="font-medium text-foreground">Drop images here</span> or click to choose
        </span>
        <span className="text-xs">JPEG, PNG, WebP or SVG, up to 10 MB each</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        multiple={multiple}
        accept={MEDIA_CONTENT_TYPES.join(",")}
        onChange={(event) => {
          onFiles([...(event.target.files ?? [])]);
          event.target.value = "";
        }}
      />

      {uploads.length > 0 && (
        <ul className="flex flex-col gap-2">
          {uploads.map((upload) => (
            <UploadRow key={upload.id} upload={upload} onRetry={onRetry} />
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadRow({ upload, onRetry }: { upload: MediaUpload; onRetry: (id: string) => void }) {
  return (
    <li className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
      <div className="min-w-0 flex-1">
        <div className="truncate">{upload.file.name}</div>
        {upload.status === "error" ? (
          <div className="text-xs text-destructive">{upload.error}</div>
        ) : (
          <Progress className="mt-1.5" value={Math.round(upload.progress * 100)} />
        )}
      </div>
      {upload.status === "done" && <span className="text-xs text-muted-foreground">Done</span>}
      {upload.status === "error" && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Retry ${upload.file.name}`}
          onClick={() => onRetry(upload.id)}
        >
          <RotateCw />
        </Button>
      )}
    </li>
  );
}
