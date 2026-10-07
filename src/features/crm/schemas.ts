import { z } from "zod";

const requiredText = (max: number, min = 2) => z.string().trim().min(min).max(max);
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((value) => value || null);

const contactFields = {
  fullName: requiredText(200),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  phone: z.string().trim().max(40)
    .regex(/^\+?[0-9 ().-]+$/, "Enter a contact number.")
    .refine((value) => {
      const digits = value.replace(/\D/g, "").length;
      return digits >= 7 && digits <= 15;
    }, "Enter a contact number with 7 to 15 digits."),
  consent: z.literal(true, { message: "Consent is required." })
};

// Unknown fields are rejected, including client-supplied prices/payment status.
export const registrationSchema = z.strictObject({
  ...contactFields,
  workshopSessionId: z.uuid().transform((value) => value.toLowerCase()),
  occupation: requiredText(200),
  salaryRange: requiredText(100, 1),
  city: optionalText(200)
});

// Programme titles, attendee bands, and preferred dates retain the site's text
// values. Their allowed values are not copied from another repository's demos.
export const corporateInquirySchema = z.strictObject({
  ...contactFields,
  company: requiredText(200),
  role: requiredText(200),
  program: requiredText(200, 1),
  attendees: requiredText(100, 1),
  targetDate: requiredText(200),
  venue: requiredText(300),
  context: optionalText(5000),
  alsoInterested: z.array(requiredText(200, 1)).max(20).default([])
});

// Validate the Idempotency-Key header separately from the submission body.
export const idempotencyKeySchema = z.uuidv4().transform((value) => value.toLowerCase());

export type RegistrationInput = z.output<typeof registrationSchema>;
export type CorporateInquiryInput = z.output<typeof corporateInquirySchema>;
