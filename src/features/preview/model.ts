import { z } from "zod";

import { formatDateRange, formatTimeRange } from "@/features/shared/format";
import { formatPesos } from "@/features/shared/money";

const imageSchema = z.object({
  url: z.string(),
  alt: z.string()
});

/* Everything the public layout shows for one workshop or session. Null means "not filled in yet". */
export const previewModelSchema = z.object({
  title: z.string().nullable(),
  tags: z.array(z.string()),
  heroImage: imageSchema.nullable(),
  summary: z.string().nullable(),
  problem: z.string().nullable(),
  intro: z.string().nullable(),
  outcomes: z.array(z.string()),
  curriculum: z.array(z.string()),
  inclusions: z.array(z.string()),
  whatToExpect: z.array(z.string()),
  audience: z.string().nullable(),
  format: z.string().nullable(),
  primerVideoUrl: z.string().nullable(),
  primerBlurb: z.string().nullable(),
  dateText: z.string().nullable(),
  shortDateText: z.string().nullable(),
  timeText: z.string().nullable(),
  venueName: z.string().nullable(),
  city: z.string().nullable(),
  venueMapUrl: z.string().nullable(),
  priceText: z.string().nullable(),
  priceNote: z.string().nullable(),
  capacity: z.number().nullable()
});

export type PreviewModel = z.infer<typeof previewModelSchema>;

export const previewViewSchema = z.enum(["card", "page"]);

export type PreviewView = z.infer<typeof previewViewSchema>;

export const PREVIEW_MESSAGE_TYPE = "content-preview";

/* The message the editor posts to the preview frame. */
export const previewPayloadSchema = z.object({
  type: z.literal(PREVIEW_MESSAGE_TYPE),
  view: previewViewSchema,
  model: previewModelSchema
});

export type PreviewPayload = z.infer<typeof previewPayloadSchema>;

/* The message the preview frame posts when it is ready to receive a payload. */
export const PREVIEW_READY_MESSAGE = "content-preview-ready";

type PreviewImage = { url: string; alt: string };

export type WorkshopPreviewSource = {
  title: string;
  tags: { name: string }[];
  heroMedia: PreviewImage | null;
  summary: string;
  problem: string;
  intro: string;
  outcomes: string[];
  curriculum: string[];
  inclusions: string[];
  whatToExpect: string[];
  audience: string;
  format: string;
  primerVideoUrl: string;
  primerBlurb: string;
  defaultVenueName: string;
  defaultCity: string;
  defaultVenueMapUrl: string;
  defaultPriceCentavos: number | null;
  defaultPriceNote: string;
  defaultCapacity: number | null;
};

export type SessionPreviewSource = {
  date: string;
  endDate: string;
  startTime: string;
  endTime: string;
  venueName: string;
  city: string;
  venueMapUrl: string;
  priceCentavos: number | null;
  priceNote: string;
  capacity: number | null;
};

function text(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function list(values: string[]) {
  return values.map((value) => value.trim()).filter((value) => value !== "");
}

/* "Oct 9, 2026" for the card, with the end date for a multi-day session. */
function formatShortDateRange(date: string, endDate: string) {
  const format = (value: string) =>
    new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric"
    });
  return endDate === date ? format(date) : `${format(date)} - ${format(endDate)}`;
}

export type SessionDates = Pick<SessionPreviewSource, "date" | "endDate" | "startTime" | "endTime">;

function dateFields(session: SessionDates | null) {
  if (!session || session.date === "") {
    return { dateText: null, shortDateText: null, timeText: null };
  }

  const endDate = session.endDate === "" ? session.date : session.endDate;
  const hasTimes = session.startTime !== "" && session.endTime !== "";
  return {
    dateText: formatDateRange(session.date, endDate),
    shortDateText: formatShortDateRange(session.date, endDate),
    timeText: hasTimes ? `${formatTimeRange(session.startTime, session.endTime)} Manila time` : null
  };
}

/* The preview model for a workshop, with dates from its next session if it has one. */
export function buildWorkshopPreview(
  workshop: WorkshopPreviewSource,
  nextSession: SessionDates | null = null
): PreviewModel {
  return {
    title: text(workshop.title),
    tags: workshop.tags.map((tag) => tag.name),
    heroImage: workshop.heroMedia,
    summary: text(workshop.summary),
    problem: text(workshop.problem),
    intro: text(workshop.intro),
    outcomes: list(workshop.outcomes),
    curriculum: list(workshop.curriculum),
    inclusions: list(workshop.inclusions),
    whatToExpect: list(workshop.whatToExpect),
    audience: text(workshop.audience),
    format: text(workshop.format),
    primerVideoUrl: text(workshop.primerVideoUrl),
    primerBlurb: text(workshop.primerBlurb),
    ...dateFields(nextSession),
    venueName: text(workshop.defaultVenueName),
    city: text(workshop.defaultCity),
    venueMapUrl: text(workshop.defaultVenueMapUrl),
    priceText:
      workshop.defaultPriceCentavos === null ? null : formatPesos(workshop.defaultPriceCentavos),
    priceNote: text(workshop.defaultPriceNote),
    capacity: workshop.defaultCapacity
  };
}

/* The preview model for a session: the parent workshop content with the session's own date, venue, price and seats. */
export function buildSessionPreview(
  workshop: WorkshopPreviewSource,
  session: SessionPreviewSource
): PreviewModel {
  return {
    ...buildWorkshopPreview(workshop, session),
    venueName: text(session.venueName),
    city: text(session.city),
    venueMapUrl: text(session.venueMapUrl),
    priceText: session.priceCentavos === null ? null : formatPesos(session.priceCentavos),
    priceNote: text(session.priceNote),
    capacity: session.capacity
  };
}
