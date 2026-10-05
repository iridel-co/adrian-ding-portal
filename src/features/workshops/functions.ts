import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getDb } from "@/db";
import {
  createInput,
  idInput,
  listInput,
  statusInput,
  updateInput
} from "@/features/workshops/schemas";
import {
  createWorkshop,
  getWorkshop,
  listWorkshops,
  setWorkshopStatus,
  updateWorkshop
} from "@/features/workshops/service";
import { authMiddleware } from "@/lib/auth.functions";

export const $listWorkshops = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(listInput)
  .handler(({ data }) => listWorkshops(getDb(), data));

export const $getWorkshop = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data }) => getWorkshop(getDb(), data));

export const $createWorkshop = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createInput)
  .handler(({ data, context }) => createWorkshop(getDb(), context.user, data));

export const $updateWorkshop = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(updateInput)
  .handler(({ data, context }) => updateWorkshop(getDb(), context.user, data));

export const $setWorkshopStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(statusInput)
  .handler(({ data, context }) => setWorkshopStatus(getDb(), context.user, data));

export type WorkshopListItem = Awaited<ReturnType<typeof $listWorkshops>>[number];

export type WorkshopDetail = Awaited<ReturnType<typeof $getWorkshop>>;

export const workshopsQueryOptions = (input: z.input<typeof listInput> = {}) =>
  queryOptions({
    queryKey: ["workshops", "list", input],
    queryFn: () => $listWorkshops({ data: input })
  });

export const workshopQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["workshops", "detail", id],
    queryFn: () => $getWorkshop({ data: { id } })
  });
