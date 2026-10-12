import { createFileRoute } from "@tanstack/react-router";
import { handleCorporateInquiry } from "@/features/crm/intake";

export const Route = createFileRoute("/api/corporate-inquiries")({
  server: { handlers: {
    POST: ({ request }) => handleCorporateInquiry(request),
    OPTIONS: ({ request }) => handleCorporateInquiry(request)
  } }
});
