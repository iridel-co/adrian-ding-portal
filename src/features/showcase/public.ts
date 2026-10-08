import "@tanstack/react-start/server-only";
import { and, asc, eq } from "drizzle-orm";

import { client, inhouseProgram, media, taxonomyTerm, testimonial, workshop } from "@/db/schema";
import type { ContentStatus } from "@/features/shared/content-status";
import type { DbOrTx } from "@/features/shared/db-types";
import { toPublicMedia } from "@/features/shared/public-api";
import { isNotArchived, isPublished } from "@/features/shared/visibility";

type IndustryRef = { id: string; name: string; archivedAt: Date | null } | null;

/* A client keeps showing when its industry is archived; only the industry is hidden. */
export function toPublicIndustry(industry: IndustryRef) {
  if (!industry || industry.archivedAt) return null;
  return { id: industry.id, name: industry.name };
}

type WorkshopRef = { slug: string; title: string; status: ContentStatus } | null;

/* A testimonial linked to a draft or archived workshop must not reveal it. */
export function toPublicWorkshopLink(linked: WorkshopRef) {
  if (!linked || linked.status !== "published") return null;
  return { slug: linked.slug, title: linked.title };
}

type ClientFilters = {
  industry?: string;
  featured: boolean;
};

export async function listPublicClients(db: DbOrTx, filters: ClientFilters) {
  const rows = await db
    .select({
      client,
      logo: media,
      industry: {
        id: taxonomyTerm.id,
        name: taxonomyTerm.name,
        archivedAt: taxonomyTerm.archivedAt
      }
    })
    .from(client)
    .leftJoin(media, and(eq(media.id, client.logoMediaId), isNotArchived(media.archivedAt)))
    .leftJoin(taxonomyTerm, eq(taxonomyTerm.id, client.industryTermId))
    .where(
      and(
        isPublished(client.status),
        filters.industry ? eq(client.industryTermId, filters.industry) : undefined,
        filters.featured ? eq(client.isFeatured, true) : undefined
      )
    )
    .orderBy(asc(client.position), asc(client.createdAt));

  return rows.map((row) => ({
    id: row.client.id,
    name: row.client.name,
    logo: toPublicMedia(row.logo),
    industry: toPublicIndustry(row.industry),
    isFeatured: row.client.isFeatured
  }));
}

export async function listPublicIndustries(db: DbOrTx) {
  return db
    .select({ id: taxonomyTerm.id, name: taxonomyTerm.name })
    .from(taxonomyTerm)
    .where(and(eq(taxonomyTerm.kind, "client_industry"), isNotArchived(taxonomyTerm.archivedAt)))
    .orderBy(asc(taxonomyTerm.position), asc(taxonomyTerm.createdAt));
}

export async function listPublicPrograms(db: DbOrTx) {
  const rows = await db
    .select({ program: inhouseProgram, image: media })
    .from(inhouseProgram)
    .leftJoin(
      media,
      and(eq(media.id, inhouseProgram.imageMediaId), isNotArchived(media.archivedAt))
    )
    .where(isPublished(inhouseProgram.status))
    .orderBy(asc(inhouseProgram.position), asc(inhouseProgram.createdAt));

  return rows.map((row) => ({
    id: row.program.id,
    title: row.program.title,
    image: toPublicMedia(row.image),
    usefulFor: row.program.usefulFor
  }));
}

type TestimonialFilters = {
  featured: boolean;
  workshop?: string;
};

export async function listPublicTestimonials(db: DbOrTx, filters: TestimonialFilters) {
  const rows = await db
    .select({
      testimonial,
      photo: media,
      workshop: { slug: workshop.slug, title: workshop.title, status: workshop.status }
    })
    .from(testimonial)
    .leftJoin(media, and(eq(media.id, testimonial.photoMediaId), isNotArchived(media.archivedAt)))
    .leftJoin(workshop, eq(workshop.id, testimonial.workshopId))
    .where(
      and(
        isPublished(testimonial.status),
        filters.featured ? eq(testimonial.isFeatured, true) : undefined,
        filters.workshop
          ? and(eq(workshop.slug, filters.workshop), isPublished(workshop.status))
          : undefined
      )
    )
    .orderBy(asc(testimonial.position), asc(testimonial.createdAt));

  return rows.map((row) => ({
    id: row.testimonial.id,
    quote: row.testimonial.quote,
    personName: row.testimonial.personName,
    photo: toPublicMedia(row.photo),
    role: row.testimonial.role,
    company: row.testimonial.company,
    workshop: toPublicWorkshopLink(row.workshop),
    isFeatured: row.testimonial.isFeatured
  }));
}
