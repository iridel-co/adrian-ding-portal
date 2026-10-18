import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "@/db";
import { getPublicProfile } from "@/features/profile/public";
import { publicHandlers } from "@/features/shared/public-api";
import { publicInputs } from "@/features/shared/public-schemas";

export const Route = createFileRoute("/api/public/profile")({
  server: {
    handlers: publicHandlers(publicInputs.profile, (filters) => getPublicProfile(getDb(), filters))
  }
});
