import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getDb } from "@/db";
import {
  createInput,
  idInput,
  listInput,
  reorderInput,
  statusInput,
  updateInput
} from "@/features/corporate-trainings/schemas";
import {
  createProgram,
  getProgram,
  listPrograms,
  reorderPrograms,
  setProgramStatus,
  updateProgram
} from "@/features/corporate-trainings/service";
import { authMiddleware } from "@/lib/auth.functions";

export const $listPrograms = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(listInput)
  .handler(({ data }) => listPrograms(getDb(), data));

export const $getProgram = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data }) => getProgram(getDb(), data));

export const $createProgram = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createInput)
  .handler(({ data, context }) => createProgram(getDb(), context.user, data));

export const $updateProgram = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(updateInput)
  .handler(({ data, context }) => updateProgram(getDb(), context.user, data));

export const $setProgramStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(statusInput)
  .handler(({ data, context }) => setProgramStatus(getDb(), context.user, data));

export const $reorderPrograms = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(reorderInput)
  .handler(({ data, context }) => reorderPrograms(getDb(), context.user, data));

export type ProgramListItem = Awaited<ReturnType<typeof $listPrograms>>[number];

export type ProgramDetail = Awaited<ReturnType<typeof $getProgram>>;

export const programsQueryOptions = (input: z.input<typeof listInput> = {}) =>
  queryOptions({
    queryKey: ["programs", "list", input],
    queryFn: () => $listPrograms({ data: input })
  });

export const programQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["programs", "detail", id],
    queryFn: () => $getProgram({ data: { id } })
  });
