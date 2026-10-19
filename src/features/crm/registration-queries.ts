import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import { $listRegistrationSessions } from "./functions";
import type { registrationSessionListSchema } from "./registration-staff-schemas";

export const registrationQueryKey = ["workshop-registrations"] as const;
export const registrationSessionsQueryOptions = (input: z.input<typeof registrationSessionListSchema>) => queryOptions({
  queryKey: [...registrationQueryKey, "sessions", input],
  queryFn: ({ signal }) => $listRegistrationSessions({ data: input, signal }),
  retry: false, staleTime: 0, gcTime: 0, refetchInterval: 60000
});
