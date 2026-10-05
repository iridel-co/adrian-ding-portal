import { z } from "zod";

import { sessionStatus } from "@/db/schema";
import { capacitySchema, centavosSchema, optionalHttpsUrl } from "@/features/shared/field-schemas";
import { normalizeTime } from "@/features/shared/time";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2})?$/;
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const dateSchema = z.string().regex(DATE_PATTERN, "Pick a date.");
const timeSchema = z.string().regex(TIME_PATTERN, "Pick a time.").transform(normalizeTime);

/* A Manila wall-clock "YYYY-MM-DDTHH:MM", or null when empty. */
const cutoffSchema = z
  .string()
  .transform((value) => (value === "" ? null : value))
  .pipe(z.string().regex(LOCAL_DATE_TIME_PATTERN, "Pick a date and time.").nullable());

/* An empty end date means a one-day session. */
const endDateSchema = z
  .string()
  .transform((value) => (value === "" ? null : value))
  .pipe(dateSchema.nullable());

const END_TIME_ISSUE = {
  path: ["endTime"],
  message: "The end time must be after the start time."
};

const END_DATE_ISSUE = {
  path: ["endDate"],
  message: "The last day can't be before the first day."
};

type DayRange = {
  date: string;
  endDate: string | null;
};

function withEndDate<T extends DayRange>(session: T) {
  return { ...session, endDate: session.endDate ?? session.date };
}

export const sessionTimesSchema = z
  .object({
    date: dateSchema,
    endDate: endDateSchema,
    startTime: timeSchema,
    endTime: timeSchema
  })
  .refine((times) => times.endTime > times.startTime, END_TIME_ISSUE)
  .refine((times) => times.endDate === null || times.endDate >= times.date, END_DATE_ISSUE)
  .transform(withEndDate);

export const sessionSaveSchema = z
  .object({
    date: dateSchema,
    endDate: endDateSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    venueName: z.string().trim(),
    city: z.string().trim(),
    venueMapUrl: optionalHttpsUrl,
    registrationCutoff: cutoffSchema,
    priceCentavos: centavosSchema,
    priceNote: z.string().trim(),
    capacity: capacitySchema
  })
  .refine((session) => session.endTime > session.startTime, END_TIME_ISSUE)
  .refine(
    (session) => session.endDate === null || session.endDate >= session.date,
    END_DATE_ISSUE
  )
  .refine(
    (session) =>
      session.registrationCutoff === null ||
      `${session.registrationCutoff}:00` <= `${session.date}T${session.startTime}`,
    {
      path: ["registrationCutoff"],
      message: "Registration must close at or before the session starts."
    }
  )
  .transform(withEndDate);

export type SessionSaveInput = z.input<typeof sessionSaveSchema>;

/* What a session needs before it can open, beyond a published workshop. */
export const sessionOpenSchema = z.object({
  venueName: z.string().min(1),
  city: z.string().min(1)
});

export const SESSION_FIELD_LABELS = {
  venueName: "Venue",
  city: "City"
};

export const listInput = z.object({
  when: z.enum(["upcoming", "past", "all"]).default("upcoming"),
  status: z.enum(["any", ...sessionStatus.enumValues]).default("any"),
  workshopId: z.uuid().optional(),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
});

export const idInput = z.object({
  id: z.uuid()
});

export const createInput = z.object({
  workshopId: z.uuid(),
  times: sessionTimesSchema
});

export const updateInput = z.object({
  id: z.uuid(),
  values: sessionSaveSchema
});

export const statusInput = z.object({
  id: z.uuid(),
  status: z.enum(sessionStatus.enumValues)
});

export const suggestionInput = z.object({
  field: z.enum(["venueName", "city"]),
  query: z.string().trim().default("")
});
