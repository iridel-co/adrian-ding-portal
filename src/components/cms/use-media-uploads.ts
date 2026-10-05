import { useCallback, useState } from "react";

import { getMediaFileProblem } from "@/lib/cms/media-rules";
import { uploadMediaFile } from "@/lib/cms/upload-media";
import { errorMessage } from "@/lib/cms/error-message";

type UploadedMedia = Awaited<ReturnType<typeof uploadMediaFile>>;

export type MediaUpload = {
  id: string;
  file: File;
  status: "uploading" | "done" | "error";
  progress: number;
  error: string | null;
  media: UploadedMedia | null;
};

type Options = {
  onUploaded?: (media: UploadedMedia) => void;
};

/* Tracks a batch of image uploads, each with its own progress, error and retry. */
export function useMediaUploads({ onUploaded }: Options = {}) {
  const [uploads, setUploads] = useState<MediaUpload[]>([]);

  const patch = useCallback((id: string, changes: Partial<MediaUpload>) => {
    setUploads((current) =>
      current.map((upload) => (upload.id === id ? { ...upload, ...changes } : upload))
    );
  }, []);

  const start = useCallback(
    async (id: string, file: File) => {
      patch(id, { status: "uploading", progress: 0, error: null });

      try {
        const media = await uploadMediaFile(file, {
          onProgress: (progress) => patch(id, { progress })
        });
        patch(id, { status: "done", progress: 1, media });
        onUploaded?.(media);
      } catch (error) {
        const message = errorMessage(error);
        patch(id, { status: "error", error: message });
      }
    },
    [onUploaded, patch]
  );

  const addFiles = useCallback(
    (files: Iterable<File>) => {
      const added: MediaUpload[] = [...files].map((file) => {
        const problem = getMediaFileProblem(file);
        return {
          id: crypto.randomUUID(),
          file,
          status: problem ? "error" : "uploading",
          progress: 0,
          error: problem,
          media: null
        };
      });

      setUploads((current) => [...added, ...current]);

      for (const upload of added) {
        if (upload.status === "uploading") void start(upload.id, upload.file);
      }
    },
    [start]
  );

  const retry = useCallback(
    (id: string) => {
      const upload = uploads.find((item) => item.id === id);
      if (upload && !getMediaFileProblem(upload.file)) void start(id, upload.file);
    },
    [start, uploads]
  );

  const clearFinished = useCallback(() => {
    setUploads((current) => current.filter((upload) => upload.status !== "done"));
  }, []);

  return { uploads, addFiles, retry, clearFinished };
}

