import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { compileErrors, validate } from "@readme/openapi-parser";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import type { listPublicFaqs } from "@/features/faq/public";
import type { getPublicProfile } from "@/features/profile/public";
import {
  buildOpenApiDocument,
  CORPORATE_INQUIRY_ROUTE,
  getOpenApiDocument,
  PUBLIC_READ_OPERATIONS,
  toOpenApiPath
} from "@/features/shared/openapi";
import type {
  clientSchema,
  faqSchema,
  industrySchema,
  profileSchema,
  programSchema,
  testimonialSchema,
  workshopDetailSchema,
  workshopListItemSchema
} from "@/features/shared/public-schemas";
import type {
  getPublicProgramBySlug,
  listPublicClients,
  listPublicIndustries,
  listPublicPrograms,
  listPublicTestimonials
} from "@/features/showcase/public";
import type { getPublicWorkshopBySlug, listPublicWorkshops } from "@/features/workshops/public";

const ROUTES_DIR = join(import.meta.dirname, "../../routes");

/* Every route file under api/public, as a TanStack route id. */
function publicRouteIds() {
  const dir = join(ROUTES_DIR, "api/public");
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"))
    .map((file) =>
      `/${relative(ROUTES_DIR, join(dir, file))}`
        .replace(/\.ts$/, "")
        .replace(/\/index$/, "/")
        .replace("[.]", ".")
    )
    .sort();
}

type Loaded<Loader extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<Loader>>;

describe("OpenAPI document", () => {
  it("is a valid OpenAPI 3.1 document", async () => {
    const result = await validate(structuredClone(buildOpenApiDocument()));
    expect(result.valid ? "" : compileErrors(result)).toBe("");
    expect(result.warnings).toEqual([]);
  });

  it("has an operation for every public route file", () => {
    const registered = PUBLIC_READ_OPERATIONS.map((operation) => operation.route).sort();
    expect(registered).toEqual(publicRouteIds());
  });

  it("documents the corporate inquiry endpoint", () => {
    const document = buildOpenApiDocument();
    const post = document.paths[CORPORATE_INQUIRY_ROUTE].post;
    expect(post).toMatchObject({ requestBody: { required: true } });
  });

  it("splits path and query params", () => {
    const document = buildOpenApiDocument();
    expect(document.paths["/api/public/programs/{slug}"].get).toMatchObject({
      parameters: [{ name: "slug", in: "path", required: true }, { name: "If-None-Match", in: "header" }]
    });
    expect(document.paths["/api/public/clients"].get).toMatchObject({
      parameters: [
        { name: "industry", in: "query", required: false },
        { name: "featured", in: "query", required: false },
        { name: "If-None-Match", in: "header" }
      ]
    });
  });

  it("builds the served document once", () => {
    expect(getOpenApiDocument()).toBe(getOpenApiDocument());
  });

  it("converts route ids to OpenAPI paths", () => {
    expect(toOpenApiPath("/api/public/programs/$slug")).toBe("/api/public/programs/{slug}");
    expect(toOpenApiPath("/api/public/programs/")).toBe("/api/public/programs");
  });
});

describe("response schemas match the loaders", () => {
  it("has the same types as the loader output", () => {
    expectTypeOf<Loaded<typeof getPublicProfile>>().toEqualTypeOf<z.output<typeof profileSchema>>();
    expectTypeOf<Loaded<typeof listPublicWorkshops>>().toEqualTypeOf<z.output<typeof workshopListItemSchema>[]>();
    expectTypeOf<Loaded<typeof getPublicWorkshopBySlug>>().toEqualTypeOf<z.output<typeof workshopDetailSchema>>();
    expectTypeOf<Loaded<typeof listPublicPrograms>>().toEqualTypeOf<z.output<typeof programSchema>[]>();
    expectTypeOf<Loaded<typeof getPublicProgramBySlug>>().toEqualTypeOf<z.output<typeof programSchema>>();
    expectTypeOf<Loaded<typeof listPublicClients>>().toEqualTypeOf<z.output<typeof clientSchema>[]>();
    expectTypeOf<Loaded<typeof listPublicIndustries>>().toEqualTypeOf<z.output<typeof industrySchema>[]>();
    expectTypeOf<Loaded<typeof listPublicTestimonials>>().toEqualTypeOf<z.output<typeof testimonialSchema>[]>();
    expectTypeOf<Loaded<typeof listPublicFaqs>>().toEqualTypeOf<z.output<typeof faqSchema>[]>();
  });
});
