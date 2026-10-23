import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "@/db";
import { CACHE_CONTROL, publicHandlers } from "@/features/shared/public-api";
import { publicInputs } from "@/features/shared/public-schemas";
import { listPublicWorkshops } from "@/features/workshops/public";

export const Route = createFileRoute("/api/public/workshops/")({
  server: {
    handlers: publicHandlers(publicInputs.workshops, (filters) => listPublicWorkshops(getDb(), filters), CACHE_CONTROL.availability)
  }
});
