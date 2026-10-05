export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

export const MEDIA_EXTENSION_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg"
} as const;

export type MediaContentType = keyof typeof MEDIA_EXTENSION_BY_TYPE;

export const MEDIA_CONTENT_TYPES = Object.keys(MEDIA_EXTENSION_BY_TYPE) as MediaContentType[];

export function isMediaContentType(type: string): type is MediaContentType {
  return type in MEDIA_EXTENSION_BY_TYPE;
}

/* Returns a message to show the user, or null when the file can be uploaded. */
export function getMediaFileProblem(file: { type: string; size: number }) {
  if (!isMediaContentType(file.type)) {
    return "Use a JPEG, PNG, WebP or SVG image.";
  }

  if (file.size > MAX_MEDIA_BYTES) {
    return "Images must be 10 MB or smaller.";
  }

  return null;
}
