import { createFileRoute } from "@tanstack/react-router";
import { handleSubmission } from "@/features/crm/http";

export const Route = createFileRoute("/api/corporate-inquiries")({
  server: { handlers: {
    POST: ({ request }) => handleSubmission(request, "corporate"),
    OPTIONS: ({ request }) => handleSubmission(request, "corporate")
  } }
});
