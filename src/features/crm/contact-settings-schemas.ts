import { z } from "zod";

const replyTo = z.string().trim().toLowerCase().max(254).pipe(z.email("Enter one valid email address."))
  .refine(value => !/example\.|\.invalid|\[|\]/i.test(value), "Enter a working team email address.");

export const crmContactSettingsSchema = z.strictObject({
  corporatePhone: z.string().trim().max(40).regex(/^\+?[0-9 ().-]+$/, "Enter one contact number.")
    .refine(value => {
      const digits = value.replace(/\D/g, "").length;
      return digits >= 7 && digits <= 15;
    }, "Enter a contact number with 7 to 15 digits."),
  corporateReplyTo: replyTo,
  registrationReplyTo: replyTo
});

export type CrmContactValues = z.infer<typeof crmContactSettingsSchema>;
