import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getDb } from "@/db";
import { publicHandlers } from "@/features/shared/public-api";
import { listPublicIndustries } from "@/features/showcase/public";

const input = z.object({});

export const Route = createFileRoute("/api/public/industries")({
  server: {
    handlers: publicHandlers(input, () => listPublicIndustries(getDb()))
  }
});
