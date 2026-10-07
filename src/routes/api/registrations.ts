import { createFileRoute } from "@tanstack/react-router";
import { handleSubmission } from "@/features/crm/http";

export const Route = createFileRoute("/api/registrations")({
  server: { handlers: {
    POST: ({ request }) => handleSubmission(request, "registration"),
    OPTIONS: ({ request }) => handleSubmission(request, "registration")
  } }
});
