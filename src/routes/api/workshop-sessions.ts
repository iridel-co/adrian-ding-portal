import { createFileRoute } from "@tanstack/react-router";
import { handleSessionLookup } from "@/features/crm/session-lookup";

export const Route = createFileRoute("/api/workshop-sessions")({
  server: { handlers: {
    GET: ({ request }) => handleSessionLookup(request),
    OPTIONS: ({ request }) => handleSessionLookup(request)
  } }
});
