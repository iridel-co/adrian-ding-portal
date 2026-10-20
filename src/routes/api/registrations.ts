import { createFileRoute } from "@tanstack/react-router";
import { handleRegistration } from "@/features/crm/registration-intake";

export const Route = createFileRoute("/api/registrations")({
  server: { handlers: {
    POST: ({ request }) => handleRegistration(request),
    OPTIONS: ({ request }) => handleRegistration(request)
  } }
});
