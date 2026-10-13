import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "@/db";
import { listPublicFaqs } from "@/features/faq/public";
import { publicHandlers } from "@/features/shared/public-api";
import { publicInputs } from "@/features/shared/public-schemas";

export const Route = createFileRoute("/api/public/faqs")({
  server: {
    handlers: publicHandlers(publicInputs.faqs, (filters) => listPublicFaqs(getDb(), filters))
  }
});
