import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getDb } from "@/db";
import { publicHandlers } from "@/features/shared/public-api";
import { getPublicWorkshopBySlug } from "@/features/workshops/public";

const input = z.object({
  slug: z.string().min(1)
});

export const Route = createFileRoute("/api/public/workshops/$slug")({
  server: {
    handlers: publicHandlers(input, ({ slug }) => getPublicWorkshopBySlug(getDb(), slug))
  }
});
