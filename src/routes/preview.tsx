import { Outlet, createFileRoute } from "@tanstack/react-router";

import { requireUser } from "@/lib/require-user";

/* Bare pages for the editor preview frame. They require a signed-in user and have no app shell. */
export const Route = createFileRoute("/preview")({
  beforeLoad: async ({ context }) => {
    await requireUser(context.queryClient);
  },
  component: Outlet
});
