import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getDb } from "@/db";
import {
  createInput,
  idInput,
  listInput,
  statusInput,
  suggestionInput,
  updateInput
} from "@/features/sessions/schemas";
import {
  createSession,
  getSession,
  listSessions,
  listVenueSuggestions,
  setSessionStatus,
  updateSession
} from "@/features/sessions/service";
import { authMiddleware } from "@/lib/auth.functions";

export const $listSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(listInput)
  .handler(({ data }) => listSessions(getDb(), data));

export const $getSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(idInput)
  .handler(({ data }) => getSession(getDb(), data));

export const $createSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createInput)
  .handler(({ data, context }) => createSession(getDb(), context.user, data));

export const $updateSession = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(updateInput)
  .handler(({ data, context }) => updateSession(getDb(), context.user, data));

export const $setSessionStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(statusInput)
  .handler(({ data, context }) => setSessionStatus(getDb(), context.user, data));

export const $listVenueSuggestions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(suggestionInput)
  .handler(({ data }) => listVenueSuggestions(getDb(), data));

export type SessionListItem = Awaited<ReturnType<typeof $listSessions>>[number];

export type SessionDetail = Awaited<ReturnType<typeof $getSession>>;

export const sessionsQueryOptions = (input: z.input<typeof listInput> = {}) =>
  queryOptions({
    queryKey: ["sessions", "list", input],
    queryFn: () => $listSessions({ data: input })
  });

export const sessionQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["sessions", "detail", id],
    queryFn: () => $getSession({ data: { id } })
  });

export const venueSuggestionsQueryOptions = (input: z.input<typeof suggestionInput>) =>
  queryOptions({
    queryKey: ["sessions", "venue-suggestions", input],
    queryFn: () => $listVenueSuggestions({ data: input })
  });
