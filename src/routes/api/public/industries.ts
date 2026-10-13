import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "@/db";
import { publicHandlers } from "@/features/shared/public-api";
import { publicInputs } from "@/features/shared/public-schemas";
import { listPublicIndustries } from "@/features/showcase/public";

export const Route = createFileRoute("/api/public/industries")({
  server: {
    handlers: publicHandlers(publicInputs.industries, () => listPublicIndustries(getDb()))
  }
});
