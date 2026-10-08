import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getDb } from "@/db";
import { booleanParam, publicHandlers } from "@/features/shared/public-api";
import { listPublicClients } from "@/features/showcase/public";

const input = z.object({
  industry: z.uuid().optional(),
  featured: booleanParam
});

export const Route = createFileRoute("/api/public/clients")({
  server: {
    handlers: publicHandlers(input, (filters) => listPublicClients(getDb(), filters))
  }
});
