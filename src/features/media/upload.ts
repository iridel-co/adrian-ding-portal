import { $confirmMediaUpload, $requestMediaUpload } from "@/features/media/functions";
import { getMediaFileProblem, isMediaContentType } from "@/features/media/rules";

type ImageSize = {
  width: number | null;
  height: number | null;
};

type UploadOptions = {
  alt?: string;
  onProgress?: (fraction: number) => void;
};

const UNKNOWN_SIZE: ImageSize = { width: null, height: null };

function readSvgSize(svgText: string): ImageSize {
  const svg = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;
  const viewBox = svg.getAttribute("viewBox")?.trim().split(/[\s,]+/).map(Number);

  if (viewBox?.length === 4 && viewBox.every(Number.isFinite)) {
    return { width: Math.round(viewBox[2]), height: Math.round(viewBox[3]) };
  }

  const width = Number.parseFloat(svg.getAttribute("width") ?? "");
  const height = Number.parseFloat(svg.getAttribute("height") ?? "");
  if (width > 0 && height > 0) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  return UNKNOWN_SIZE;
}

async function readImageSize(file: File): Promise<ImageSize> {
  if (file.type === "image/svg+xml") {
    return readSvgSize(await file.text());
  }

  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();

  return size;
}

function putWithProgress(url: string, file: File, onProgress?: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", file.type);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${request.status}.`));
      }
    };
    request.onerror = () => reject(new Error("Upload failed. Check your connection."));

    request.send(file);
  });
}

/* Uploads one image straight to R2, then records it in the media library. */
export async function uploadMediaFile(file: File, options: UploadOptions = {}) {
  const problem = getMediaFileProblem(file);
  if (problem || !isMediaContentType(file.type)) {
    throw new Error(problem ?? "Unsupported file type.");
  }

  const size = await readImageSize(file).catch(() => UNKNOWN_SIZE);

  const { key, uploadUrl } = await $requestMediaUpload({
    data: {
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size
    }
  });

  await putWithProgress(uploadUrl, file, options.onProgress);

  return $confirmMediaUpload({
    data: {
      key,
      fileName: file.name,
      width: size.width,
      height: size.height,
      alt: options.alt ?? ""
    }
  });
}
