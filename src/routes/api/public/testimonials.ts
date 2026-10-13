import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "@/db";
import { publicHandlers } from "@/features/shared/public-api";
import { publicInputs } from "@/features/shared/public-schemas";
import { listPublicTestimonials } from "@/features/showcase/public";

export const Route = createFileRoute("/api/public/testimonials")({
  server: {
    handlers: publicHandlers(publicInputs.testimonials, (filters) => listPublicTestimonials(getDb(), filters))
  }
});
