import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { getAuthUserQueryOptions } from "@/lib/auth.queries";

/* The signed-in user, or a redirect to the login page. */
export async function requireUser(queryClient: QueryClient) {
  const user = await queryClient.ensureQueryData(getAuthUserQueryOptions());
  if (!user) throw redirect({ to: "/login" });
  return user;
}
