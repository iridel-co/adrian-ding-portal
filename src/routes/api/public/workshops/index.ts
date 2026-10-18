import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "@/db";
import { publicHandlers } from "@/features/shared/public-api";
import { publicInputs } from "@/features/shared/public-schemas";
import { listPublicWorkshops } from "@/features/workshops/public";

export const Route = createFileRoute("/api/public/workshops/")({
  server: {
    handlers: publicHandlers(publicInputs.workshops, (filters) => listPublicWorkshops(getDb(), filters))
  }
});
