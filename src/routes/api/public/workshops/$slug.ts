import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "@/db";
import { publicHandlers } from "@/features/shared/public-api";
import { publicInputs } from "@/features/shared/public-schemas";
import { getPublicWorkshopBySlug } from "@/features/workshops/public";

export const Route = createFileRoute("/api/public/workshops/$slug")({
  server: {
    handlers: publicHandlers(publicInputs.workshop, ({ slug }) => getPublicWorkshopBySlug(getDb(), slug))
  }
});
