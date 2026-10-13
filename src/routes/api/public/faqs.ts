import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getDb } from "@/db";
import { faqGroup } from "@/db/schema";
import { listPublicFaqs } from "@/features/faq/public";
import { publicHandlers } from "@/features/shared/public-api";

const input = z.object({
  group: z.enum(faqGroup.enumValues).optional()
});

export const Route = createFileRoute("/api/public/faqs")({
  server: {
    handlers: publicHandlers(input, (filters) => listPublicFaqs(getDb(), filters))
  }
});
