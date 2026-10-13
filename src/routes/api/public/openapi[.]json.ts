import { createFileRoute } from "@tanstack/react-router";

import { buildOpenApiDocument } from "@/features/shared/openapi";
import { publicHandlers } from "@/features/shared/public-api";
import { publicInputs } from "@/features/shared/public-schemas";

export const Route = createFileRoute("/api/public/openapi.json")({
  server: {
    handlers: publicHandlers(publicInputs.openapi, async () => buildOpenApiDocument())
  }
});
