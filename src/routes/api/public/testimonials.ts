import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { getDb } from "@/db";
import { booleanParam, publicHandlers } from "@/features/shared/public-api";
import { listPublicTestimonials } from "@/features/showcase/public";

const input = z.object({
  featured: booleanParam,
  workshop: z.string().trim().min(1).optional()
});

export const Route = createFileRoute("/api/public/testimonials")({
  server: {
    handlers: publicHandlers(input, (filters) => listPublicTestimonials(getDb(), filters))
  }
});
