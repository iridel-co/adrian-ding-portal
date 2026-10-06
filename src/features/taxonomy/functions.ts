import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getDb } from "@/db";
import {
  createInput,
  idInput,
  listInput,
  renameInput,
  reorderInput
} from "@/features/taxonomy/schemas";
import {
  archiveTerm,
  createTerm,
  listTerms,
  renameTerm,
  reorderTerms,
  restoreTerm
} from "@/features/taxonomy/service";
import { authMiddleware } from "@/lib/auth.functions";

export type { TaxonomyKind } from "@/features/taxonomy/schemas";

export const $listTerms = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(listInput)
  .handler(({ data }) => listTerms(getDb(), data));

export const $createTerm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createInput)
  .handler(({ data, context }) => createTerm(getDb(), context.user, data));

export const $renameTerm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(renameInput)
  .handler(({ data, context }) => renameTerm(getDb(), context.user, data));

export const $reorderTerms = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reorderInput)
  .handler(({ data, context }) => reorderTerms(getDb(), context.user, data));

export const $archiveTerm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => archiveTerm(getDb(), context.user, data));

export const $restoreTerm = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data, context }) => restoreTerm(getDb(), context.user, data));

export type TaxonomyTerm = Awaited<ReturnType<typeof $listTerms>>[number];

export const termsQueryOptions = (input: z.input<typeof listInput>) =>
  queryOptions({
    queryKey: ["taxonomy", input.kind, input],
    queryFn: () => $listTerms({ data: input })
  });
