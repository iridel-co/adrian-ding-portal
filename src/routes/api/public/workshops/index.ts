import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getDb } from "@/db";
import { booleanParam, publicHandlers } from "@/features/shared/public-api";
import { listPublicWorkshops } from "@/features/workshops/public";

const input = z.object({
  tag: z.string().trim().min(1).optional(),
  upcoming: booleanParam
});

export const Route = createFileRoute("/api/public/workshops/")({
  server: {
    handlers: publicHandlers(input, (filters) => listPublicWorkshops(getDb(), filters))
  }
});
