import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "@/db";
import { publicHandlers } from "@/features/shared/public-api";
import { publicInputs } from "@/features/shared/public-schemas";
import { listPublicClients } from "@/features/showcase/public";

export const Route = createFileRoute("/api/public/clients")({
  server: {
    handlers: publicHandlers(publicInputs.clients, (filters) => listPublicClients(getDb(), filters))
  }
});
