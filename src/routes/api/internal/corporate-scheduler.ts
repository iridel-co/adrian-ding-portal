import { createFileRoute } from "@tanstack/react-router";
import { handleCorporateScheduler } from "@/features/crm/scheduler";

export const Route = createFileRoute("/api/internal/corporate-scheduler")({
  server: { handlers: { POST: ({ request }) => handleCorporateScheduler(request) } }
});
