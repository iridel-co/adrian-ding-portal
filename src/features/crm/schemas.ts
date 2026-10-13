import { corporateInquiryStatus } from "@/db/schema";
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

const optionalDate = z.union([z.iso.date(), z.literal("")]).optional().transform(value => value || null);

// Keep picked dates structured and preserve "Not fixed yet" as separate text.
export const corporateInquirySchema = z.strictObject({
  ...contactFields,
  company: requiredText(200),
  role: requiredText(200),
  program: requiredText(200, 1),
  attendees: requiredText(100, 1),
  targetDateFrom: optionalDate,
  targetDateTo: optionalDate,
  targetDateText: optionalText(200),
  venue: requiredText(300),
  context: optionalText(5000),
  alsoInterested: z.array(requiredText(200, 1)).max(20).default([])
}).superRefine((input, context) => {
  if (input.targetDateFrom && input.targetDateText) {
    context.addIssue({ code: "custom", path: ["targetDateText"], message: "Choose picked dates or a rough date description." });
  }
  if (!input.targetDateFrom && !input.targetDateText) {
    context.addIssue({ code: "custom", path: ["targetDateFrom"], message: "A start date or rough date description is required." });
  }
  if (input.targetDateTo && !input.targetDateFrom) {
    context.addIssue({ code: "custom", path: ["targetDateFrom"], message: "An end date needs a start date." });
  }
  if (input.targetDateFrom && input.targetDateTo && input.targetDateTo < input.targetDateFrom) {
    context.addIssue({ code: "custom", path: ["targetDateTo"], message: "End date cannot precede start date." });
  }
});

// The request body of the public inquiry endpoint: the answers, a honeypot field and a Turnstile token.
export const corporateInquirySubmissionSchema = corporateInquirySchema.safeExtend({
  website: z.string().max(200).default(""),
  turnstileToken: z.string().min(1).max(2048)
});

// Validate the Idempotency-Key header separately from the submission body.
export const idempotencyKeySchema = z.uuidv4().transform((value) => value.toLowerCase());

export type CorporateInquiryInput = z.output<typeof corporateInquirySchema>;

export const inquiryPageSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(100000).default(0)
});

export const inquiryListSchema = inquiryPageSchema.extend({
  status: z.enum(["all", "non-spam", ...corporateInquiryStatus.enumValues]).default("all"),
  search: z.string().trim().max(200).default("")
});

export const inquiryTransitionSchema = z.strictObject({
  expectedStatus: z.enum(corporateInquiryStatus.enumValues),
  status: z.enum(corporateInquiryStatus.enumValues).exclude(["NEW"]),
  estimatedValueCentavos: z.number().int().min(0).max(2147483647).optional(),
  lostReason: z.string().trim().min(1).max(2000).optional()
}).superRefine((input, context) => {
  if (input.status === "PROPOSAL_SENT" && input.estimatedValueCentavos === undefined) {
    context.addIssue({ code: "custom", path: ["estimatedValueCentavos"], message: "Proposal value is required." });
  }
  if (input.status !== "PROPOSAL_SENT" && input.estimatedValueCentavos !== undefined) {
    context.addIssue({ code: "custom", path: ["estimatedValueCentavos"], message: "Record value when sending a proposal." });
  }
  if (input.status === "LOST" && !input.lostReason) {
    context.addIssue({ code: "custom", path: ["lostReason"], message: "Loss reason is required." });
  }
  if (input.status !== "LOST" && input.lostReason !== undefined) {
    context.addIssue({ code: "custom", path: ["lostReason"], message: "A loss reason applies only to lost inquiries." });
  }
});
