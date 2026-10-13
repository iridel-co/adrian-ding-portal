import { z } from "zod";

import { corporateInquirySubmissionSchema } from "@/features/crm/schemas";
import {
  clientSchema,
  faqSchema,
  industrySchema,
  profileSchema,
  programSchema,
  publicErrorSchema,
  publicInputs,
  testimonialSchema,
  workshopDetailSchema,
  workshopListItemSchema
} from "@/features/shared/public-schemas";

type JsonSchema = Record<string, unknown>;

type ReadOperation = {
  /* The TanStack file route id, such as "/api/public/programs/$slug". */
  route: string;
  summary: string;
  description: string;
  tag: string;
  input: z.ZodObject;
  response: z.ZodType | null;
};

export const PUBLIC_READ_OPERATIONS: ReadOperation[] = [
  {
    route: "/api/public/profile",
    summary: "Get the site profile",
    description: "Hero copy, bio, contacts, stats, timeline, credentials and the corporate primer.",
    tag: "Profile",
    input: publicInputs.profile,
    response: profileSchema
  },
  {
    route: "/api/public/workshops/",
    summary: "List published workshops",
    description: "Workshops with an upcoming session come first, sorted by that session date.",
    tag: "Workshops",
    input: publicInputs.workshops,
    response: z.array(workshopListItemSchema)
  },
  {
    route: "/api/public/workshops/$slug",
    summary: "Get one published workshop",
    description: "Returns the workshop with all its upcoming open and closed sessions.",
    tag: "Workshops",
    input: publicInputs.workshop,
    response: workshopDetailSchema
  },
  {
    route: "/api/public/programs/",
    summary: "List corporate training programs",
    description: "Published in-house corporate training programs in CMS order.",
    tag: "Corporate training",
    input: publicInputs.programs,
    response: z.array(programSchema)
  },
  {
    route: "/api/public/programs/$slug",
    summary: "Get one corporate training program",
    description: "Returns one published in-house program.",
    tag: "Corporate training",
    input: publicInputs.program,
    response: programSchema
  },
  {
    route: "/api/public/clients",
    summary: "List published clients",
    description: "Clients for the logo wall, in CMS order.",
    tag: "Corporate training",
    input: publicInputs.clients,
    response: z.array(clientSchema)
  },
  {
    route: "/api/public/industries",
    summary: "List client industries",
    description: "Industries that are not archived, for the logo wall filter.",
    tag: "Corporate training",
    input: publicInputs.industries,
    response: z.array(industrySchema)
  },
  {
    route: "/api/public/testimonials",
    summary: "List published testimonials",
    description: "Testimonials in CMS order.",
    tag: "Corporate training",
    input: publicInputs.testimonials,
    response: z.array(testimonialSchema)
  },
  {
    route: "/api/public/faqs",
    summary: "List published FAQs",
    description: "FAQs sorted by group, then by CMS position.",
    tag: "FAQ",
    input: publicInputs.faqs,
    response: z.array(faqSchema)
  },
  {
    route: "/api/public/openapi.json",
    summary: "Get this OpenAPI document",
    description: "The OpenAPI 3.1 description of the public API.",
    tag: "Meta",
    input: publicInputs.openapi,
    response: null
  }
];

export const CORPORATE_INQUIRY_ROUTE = "/api/corporate-inquiries";

const INQUIRY_ERROR_CODES = {
  400: ["invalid_json", "invalid_submission", "invalid_idempotency_key", "submission_rejected", "verification_failed", "headers_not_allowed"],
  403: ["origin_not_allowed"],
  405: ["method_not_allowed"],
  408: ["request_timeout"],
  409: ["idempotency_key_mismatch"],
  413: ["body_too_large"],
  415: ["unsupported_content_type"],
  503: ["intake_unavailable", "verification_unavailable"]
} as const;

/* "/api/public/programs/$slug" -> "/api/public/programs/{slug}", without a trailing slash. */
export function toOpenApiPath(route: string) {
  return route.replace(/\$(\w+)/g, "{$1}").replace(/(.)\/$/, "$1");
}

function pathParamNames(route: string) {
  return [...route.matchAll(/\$(\w+)/g)].map((match) => match[1]);
}

/* Converts a Zod schema to JSON Schema with refs that point into components. */
function toSchema(schema: z.ZodType, io: "input" | "output"): JsonSchema {
  const converted = z.toJSONSchema(schema, { io, target: "draft-2020-12", unrepresentable: "any" });
  const json = JSON.stringify(converted).replaceAll('"#/$defs/', '"#/components/schemas/');
  const { $schema: _dialect, ...rest }: JsonSchema = JSON.parse(json);
  return rest;
}

function hoistDefs(schema: JsonSchema, components: Record<string, JsonSchema>) {
  const { $defs, ...rest } = schema;
  Object.assign(components, $defs);
  return rest;
}

function toParameters(operation: ReadOperation) {
  const inPath = pathParamNames(operation.route);
  const schema = toSchema(operation.input, "input");
  const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;
  const required = (schema.required ?? []) as string[];

  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: inPath.includes(name) ? "path" : "query",
    required: inPath.includes(name) || required.includes(name),
    schema: property
  }));
}

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } }
});

const corsHeader = { "Access-Control-Allow-Origin": { schema: { type: "string" } } };

function readOperation(operation: ReadOperation, components: Record<string, JsonSchema>) {
  const pathParams = pathParamNames(operation.route);
  const okSchema = operation.response
    ? hoistDefs(toSchema(operation.response, "output"), components)
    : { type: "object", description: "An OpenAPI 3.1 document" };

  return {
    tags: [operation.tag],
    summary: operation.summary,
    description: operation.description,
    parameters: [
      ...toParameters(operation),
      {
        name: "If-None-Match",
        in: "header",
        required: false,
        description: "An ETag from an earlier response. A match returns 304.",
        schema: { type: "string" }
      }
    ],
    responses: {
      200: {
        description: "OK",
        headers: {
          ETag: { description: "Strong hash of the response body", schema: { type: "string" } },
          "Cache-Control": { schema: { type: "string" } },
          ...corsHeader
        },
        content: { "application/json": { schema: okSchema } }
      },
      304: { description: "Not Modified. The ETag in If-None-Match is current." },
      400: errorResponse("A query or path param fails validation (`invalid_request`)"),
      ...(pathParams.length ? { 404: errorResponse("The item does not exist or is not published (`not_found`)") } : {}),
      405: errorResponse("The method is not GET or OPTIONS (`method_not_allowed`)"),
      500: errorResponse("The server fails (`internal_error`)")
    }
  };
}

function inquiryOperation(components: Record<string, JsonSchema>) {
  const body = hoistDefs(toSchema(corporateInquirySubmissionSchema, "input"), components);
  const errors = Object.fromEntries(
    Object.entries(INQUIRY_ERROR_CODES).map(([status, codes]) => [
      status,
      {
        description: codes.map((code) => `\`${code}\``).join(", "),
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["error"],
              properties: { error: { type: "string", enum: [...codes] } }
            }
          }
        }
      }
    ])
  );

  return {
    tags: ["Corporate training"],
    summary: "Submit a corporate training inquiry",
    description:
      "Accepts an inquiry from an allowed site origin. Every attempt needs a fresh Cloudflare Turnstile token. " +
      "A retry with the same Idempotency-Key and the same answers returns 202 again and creates no duplicate.",
    parameters: [
      {
        name: "Idempotency-Key",
        in: "header",
        required: true,
        description: "A UUID v4. Reuse it only to retry the same submission.",
        schema: { type: "string", format: "uuid" }
      },
      {
        name: "Origin",
        in: "header",
        required: true,
        description: "Must be one of the origins in SITE_ORIGINS.",
        schema: { type: "string" }
      }
    ],
    requestBody: { required: true, content: { "application/json": { schema: body } } },
    responses: {
      202: {
        description: "Accepted",
        headers: corsHeader,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["accepted"],
              properties: { accepted: { type: "boolean", const: true } }
            }
          }
        }
      },
      ...errors
    }
  };
}

export function buildOpenApiDocument(serverUrl?: string) {
  const components: Record<string, JsonSchema> = {};
  hoistDefs(toSchema(publicErrorSchema, "output"), components);
  const paths: Record<string, Record<string, unknown>> = {};

  for (const operation of PUBLIC_READ_OPERATIONS) {
    paths[toOpenApiPath(operation.route)] = { get: readOperation(operation, components) };
  }
  paths[CORPORATE_INQUIRY_ROUTE] = { post: inquiryOperation(components) };

  return {
    openapi: "3.1.1",
    info: {
      title: "Adrian Ding public API",
      version: "1.0.0",
      description:
        "Read-only CMS content for the public website, and the corporate training inquiry form. " +
        "Every GET is public, cached and supports ETag revalidation."
    },
    ...(serverUrl ? { servers: [{ url: serverUrl }] } : {}),
    tags: [
      { name: "Corporate training", description: "Programs, clients, industries, testimonials and inquiries" },
      { name: "Workshops" },
      { name: "Profile" },
      { name: "FAQ" },
      { name: "Meta" }
    ],
    paths,
    components: { schemas: components }
  };
}
