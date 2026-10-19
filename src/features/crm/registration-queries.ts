import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import { $getRegistrationSession, $listRegistrations, $listRegistrationSessions } from "./functions";
import type { registrationListSchema, registrationSessionListSchema } from "./registration-staff-schemas";

export const registrationQueryKey = ["workshop-registrations"] as const;
export const registrationSessionsQueryOptions = (input: z.input<typeof registrationSessionListSchema>) => queryOptions({
  queryKey: [...registrationQueryKey, "sessions", input],
  queryFn: ({ signal }) => $listRegistrationSessions({ data: input, signal }),
  retry: false, staleTime: 0, gcTime: 0, refetchInterval: 60000
});

export const registrationSessionQueryOptions = (id: string) => queryOptions({
  queryKey: [...registrationQueryKey, "session", id],
  queryFn: ({ signal }) => $getRegistrationSession({ data: { id }, signal }),
  retry: false, staleTime: 0, gcTime: 0, refetchInterval: 60000
});
export const registrationsQueryOptions = (input: z.input<typeof registrationListSchema>) => queryOptions({
  queryKey: [...registrationQueryKey, "list", input],
  queryFn: ({ signal }) => $listRegistrations({ data: input, signal }),
  retry: false, staleTime: 0, gcTime: 0, refetchInterval: 60000
});
