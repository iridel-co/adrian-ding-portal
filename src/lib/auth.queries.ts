import { queryOptions } from "@tanstack/react-query";

import { $getUser } from "@/lib/auth.functions";

export const authQueryKeys = {
  user: ["user"]
};

export function getAuthUserQueryOptions() {
  return queryOptions({
    queryKey: authQueryKeys.user,
    queryFn: ({ signal }) => $getUser({ signal }),
    staleTime: 1000 * 60 * 5 // matches the cookie cache in lib/auth.ts
  });
}
