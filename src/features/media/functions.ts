import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getDb } from "@/db";
import {
  altInput,
  idInput,
  listInput,
  uploadConfirmInput,
  uploadRequestInput
} from "@/features/media/schemas";
import {
  archiveMedia,
  confirmMediaUpload,
  listMedia,
  requestMediaUpload,
  restoreMedia,
  updateMediaAlt
} from "@/features/media/service";
import { authMiddleware } from "@/lib/auth.functions";

export const $requestMediaUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(uploadRequestInput)
  .handler(({ data }) => requestMediaUpload(data));

export const $confirmMediaUpload = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(uploadConfirmInput)
  .handler(({ data, context }) => confirmMediaUpload(getDb(), context.user, data));

export const $listMedia = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(listInput)
  .handler(({ data }) => listMedia(getDb(), data));

export const $updateMediaAlt = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(altInput)
  .handler(({ data, context }) => updateMediaAlt(getDb(), context.user, data));

export const $archiveMedia = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => archiveMedia(getDb(), context.user, data));

export const $restoreMedia = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => restoreMedia(getDb(), context.user, data));

export type MediaItem = Awaited<ReturnType<typeof $listMedia>>[number];

export const mediaListQueryOptions = (input: z.input<typeof listInput> = {}) =>
  queryOptions({
    queryKey: ["media", input],
    queryFn: () => $listMedia({ data: input })
  });
