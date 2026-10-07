import { createFileRoute } from "@tanstack/react-router";
import { handleStaffRequest } from "@/features/crm/staff-http";

export const Route = createFileRoute("/api/crm/$")({
  server: { handlers: {
    GET: ({ request }) => handleStaffRequest(request),
    POST: ({ request }) => handleStaffRequest(request),
    PATCH: ({ request }) => handleStaffRequest(request)
  } }
});
