import { useCallback, useState } from "react";

import { getMediaFileProblem } from "@/features/media/rules";
import { uploadMediaFile } from "@/features/media/upload";
import { errorMessage } from "@/features/shared/error-message";

type UploadedMedia = Awaited<ReturnType<typeof uploadMediaFile>>;

export type MediaUpload = {
  id: string;
  file: File;
  status: "uploading" | "error";
  progress: number;
  error: string | null;
  media: UploadedMedia | null;
};

type Options = {
  onUploaded?: (media: UploadedMedia) => void | Promise<unknown>;
};

export function useMediaUploads({ onUploaded }: Options = {}) {
  const [uploads, setUploads] = useState<MediaUpload[]>([]);

  const patch = useCallback((id: string, changes: Partial<MediaUpload>) => {
    setUploads((current) =>
      current.map((upload) => (upload.id === id ? { ...upload, ...changes } : upload))
    );
  }, []);

  const remove = useCallback((id: string) => {
    setUploads((current) => current.filter((upload) => upload.id !== id));
  }, []);

  const start = useCallback(
    async (id: string, file: File) => {
      patch(id, { status: "uploading", progress: 0, error: null });

      try {
        const media = await uploadMediaFile(file, {
          onProgress: (progress) => patch(id, { progress })
        });
        patch(id, { progress: 1, media });
        // Keep the row until the new image shows, so the list never looks empty in between.
        await onUploaded?.(media);
        remove(id);
      } catch (error) {
        const message = errorMessage(error);
        patch(id, { status: "error", error: message });
      }
    },
    [onUploaded, patch, remove]
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

  return { uploads, addFiles, retry };
}

