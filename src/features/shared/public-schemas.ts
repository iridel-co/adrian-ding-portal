import { z } from "zod";

import { faqGroup, sessionStatus, STAT_PAGES } from "@/db/schema";
import { ApiErrorCode } from "@/features/shared/public-api";

/* Query-string booleans: only "true" counts as true. */
export const booleanParam = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

const slugParam = z.string().min(1).max(200);

/* Request params for each public GET route: query params and path params together. */
export const publicInputs = {
  profile: z.object({ statsPage: z.enum(STAT_PAGES).optional() }),
  workshops: z.object({ tag: z.string().trim().min(1).optional(), upcoming: booleanParam }),
  workshop: z.object({ slug: slugParam }),
  clients: z.object({ industry: z.uuid().optional(), featured: booleanParam }),
  industries: z.object({}),
  programs: z.object({}),
  program: z.object({ slug: slugParam }),
  testimonials: z.object({ featured: booleanParam, workshop: z.string().trim().min(1).optional() }),
  faqs: z.object({ group: z.enum(faqGroup.enumValues).optional() }),
  openapi: z.object({})
};

export const mediaSchema = z
  .object({
    url: z.string().describe("Absolute URL on the R2 public domain"),
    alt: z.string(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable()
  })
  .meta({ id: "Media" });

export const priceSchema = z
  .object({
    centavos: z.number().int().describe("650000 = PHP 6,500.00"),
    currency: z.literal("PHP"),
    note: z.string()
  })
  .meta({ id: "Price" });

export const sessionSchema = z
  .object({
    id: z.string(),
    date: z.string().describe("YYYY-MM-DD, first day"),
    endDate: z.string().describe("YYYY-MM-DD, last day"),
    startTime: z.string().describe("HH:MM"),
    endTime: z.string().describe("HH:MM"),
    timezone: z.string(),
    venueName: z.string(),
    city: z.string(),
    venueMapUrl: z.string().nullable(),
    registrationCutoffAt: z.string().nullable().describe("ISO 8601 instant"),
    price: priceSchema,
    capacity: z.number().int(),
    status: z.enum(sessionStatus.enumValues),
    isRegistrationOpen: z.boolean()
  })
  .meta({ id: "Session" });

export const profileSchema = z
  .object({
    headline: z.string(),
    tagline: z.string(),
    roles: z.array(z.string()),
    shortBio: z.string(),
    longBio: z.array(z.string()),
    portrait: mediaSchema.nullable(),
    emails: z.array(z.string()),
    phone: z.string(),
    footerTopics: z.array(z.string()),
    socialLinks: z.array(
      z.object({
        network: z.enum(["linkedin", "facebook", "instagram", "tiktok", "youtube"]),
        url: z.string()
      })
    ),
    stats: z.array(
      z.object({
        value: z.string(),
        label: z.string(),
        description: z.string(),
        pages: z.array(z.enum(STAT_PAGES))
      })
    ),
    timeline: z.array(
      z.object({
        period: z.string(),
        title: z.string(),
        description: z.string(),
        image: mediaSchema.nullable()
      })
    ),
    credentials: z.array(
      z.object({
        organization: z.string(),
        description: z.string(),
        logo: mediaSchema.nullable()
      })
    ),
    corporatePrimer: z.object({ videoUrl: z.string().nullable(), blurb: z.string() })
  })
  .meta({ id: "Profile" });

export const workshopListItemSchema = z
  .object({
    slug: z.string(),
    title: z.string(),
    summary: z.string(),
    heroImage: mediaSchema.nullable(),
    tags: z.array(z.string()),
    defaultPrice: priceSchema.nullable(),
    nextSession: sessionSchema.nullable()
  })
  .meta({ id: "WorkshopListItem" });

export const workshopDetailSchema = z
  .object({
    slug: z.string(),
    courseCode: z.string().nullable(),
    title: z.string(),
    summary: z.string(),
    problem: z.string(),
    intro: z.string(),
    audience: z.string(),
    format: z.string(),
    heroImage: mediaSchema.nullable(),
    primerVideoUrl: z.string().nullable(),
    primerBlurb: z.string(),
    defaultVenue: z.object({ name: z.string(), city: z.string(), mapUrl: z.string().nullable() }),
    defaultPrice: priceSchema.nullable(),
    defaultCapacity: z.number().int().nullable(),
    outcomes: z.array(z.string()),
    curriculum: z.array(z.string()),
    inclusions: z.array(z.string()),
    whatToExpect: z.array(z.string()),
    tags: z.array(z.string()),
    sessions: z.array(sessionSchema)
  })
  .meta({ id: "WorkshopDetail" });

export const industrySchema = z.object({ id: z.string(), name: z.string() }).meta({ id: "Industry" });

export const clientSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    logo: mediaSchema.nullable(),
    industry: industrySchema.nullable(),
    isFeatured: z.boolean()
  })
  .meta({ id: "Client" });

export const programSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    summary: z.string(),
    image: mediaSchema.nullable(),
    usefulFor: z.array(z.string())
  })
  .meta({ id: "Program" });

export const testimonialSchema = z
  .object({
    id: z.string(),
    quote: z.string(),
    personName: z.string(),
    photo: mediaSchema.nullable(),
    role: z.string(),
    company: z.string(),
    workshop: z.object({ slug: z.string(), title: z.string() }).nullable(),
    isFeatured: z.boolean()
  })
  .meta({ id: "Testimonial" });

export const faqSchema = z
  .object({
    id: z.string(),
    group: z.enum(faqGroup.enumValues),
    question: z.string(),
    answer: z.string()
  })
  .meta({ id: "Faq" });

export const publicErrorSchema = z
  .object({
    error: z.object({
      code: z.enum(ApiErrorCode),
      message: z.string()
    })
  })
  .meta({ id: "Error" });
