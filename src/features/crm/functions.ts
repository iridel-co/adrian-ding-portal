import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { getDb } from "@/db";
import { staffMiddleware } from "@/lib/access.functions";
import { getCorporateMailConfig } from "./config";
import { IntakeError } from "./errors";
import { inquiryListSchema, inquiryPageSchema, inquiryTransitionSchema } from "./schemas";
import { changeInquiry, inquiryDetail, listInquiries, retryInquiryEmail } from "./staff";

async function staffAction<T>(action: () => Promise<T>) {
  try { return await action(); }
  catch (error) {
    setResponseStatus(error instanceof IntakeError ? error.status : 503);
    throw new Error(error instanceof IntakeError ? error.code : "crm_unavailable");
  }
}

export const $listInquiries = createServerFn({ method: "GET" }).middleware([staffMiddleware]).validator(inquiryListSchema)
  .handler(({ data }) => staffAction(() => listInquiries(getDb(), data)));

export const $crmAccess = createServerFn({ method: "GET" }).middleware([staffMiddleware])
  .handler(({ context }) => ({ role: context.actor.role }));

export const $getInquiry = createServerFn({ method: "GET" }).middleware([staffMiddleware])
  .validator(inquiryPageSchema.extend({ id: z.uuid() }))
  .handler(({ data }) => staffAction(() => inquiryDetail(getDb(), data.id, data)));

export const $changeInquiry = createServerFn({ method: "POST" }).middleware([staffMiddleware])
  .validator(inquiryTransitionSchema.safeExtend({ id: z.uuid() }))
  .handler(({ data, context }) => staffAction(() => changeInquiry(getDb(), data.id, context.actor, data)));

export const $retryInquiryEmail = createServerFn({ method: "POST" }).middleware([staffMiddleware])
  .validator(z.strictObject({ inquiryId: z.uuid(), jobId: z.uuid() }))
  .handler(({ data, context }) => staffAction(async () => {
    const config = getCorporateMailConfig();
    if (!config.CORPORATE_EMAIL_ENABLED) throw new IntakeError(503, "email_unavailable");
    return retryInquiryEmail(getDb(), data.inquiryId, data.jobId, context.actor, config.RESEND_API_KEY);
  }));
