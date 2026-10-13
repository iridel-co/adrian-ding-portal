import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "@/db";
import { publicHandlers } from "@/features/shared/public-api";
import { publicInputs } from "@/features/shared/public-schemas";
import { getPublicProgramBySlug } from "@/features/showcase/public";

export const Route = createFileRoute("/api/public/programs/$slug")({
  server: {
    handlers: publicHandlers(publicInputs.program, ({ slug }) => getPublicProgramBySlug(getDb(), slug))
  }
});
