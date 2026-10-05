import { z } from "zod";

/* An https URL, or null when left empty. */
export const optionalHttpsUrl = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .pipe(z.url({ protocol: /^https$/, message: "Enter a full https:// link." }).nullable());

export const stringListSchema = z
  .array(z.string())
  .transform((items) => items.map((item) => item.trim()).filter(Boolean));

export const centavosSchema = z.number().int().min(0, "Price can't be negative.");

export const capacitySchema = z.number().int().min(1, "Capacity must be at least 1.");

export const nonEmptyList = z.array(z.string()).min(1);
