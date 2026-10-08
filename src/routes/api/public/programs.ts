import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getDb } from "@/db";
import { publicHandlers } from "@/features/shared/public-api";
import { listPublicPrograms } from "@/features/showcase/public";

const input = z.object({});

export const Route = createFileRoute("/api/public/programs")({
  server: {
    handlers: publicHandlers(input, () => listPublicPrograms(getDb()))
  }
});
