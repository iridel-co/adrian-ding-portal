import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "@/db";
import { publicHandlers } from "@/features/shared/public-api";
import { publicInputs } from "@/features/shared/public-schemas";
import { listPublicPrograms } from "@/features/showcase/public";

export const Route = createFileRoute("/api/public/programs/")({
  server: {
    handlers: publicHandlers(publicInputs.programs, () => listPublicPrograms(getDb()))
  }
});
