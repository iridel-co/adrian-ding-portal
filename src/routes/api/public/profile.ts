import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getDb } from "@/db";
import { STAT_PAGES } from "@/db/schema";
import { getPublicProfile } from "@/features/profile/public";
import { publicHandlers } from "@/features/shared/public-api";

const input = z.object({
  statsPage: z.enum(STAT_PAGES).optional()
});

export const Route = createFileRoute("/api/public/profile")({
  server: {
    handlers: publicHandlers(input, (filters) => getPublicProfile(getDb(), filters))
  }
});
