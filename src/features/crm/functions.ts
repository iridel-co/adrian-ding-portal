import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { z } from "zod";
import { getDb } from "@/db";
import { staffMiddleware } from "@/lib/access.functions";
import { getCorporateMailConfig, getRegistrationMailConfig } from "./config";
import { sendEmailJob } from "./email";
import { CrmErrorCode, IntakeError, IntakeErrorCode } from "./errors";
import { inquiryListSchema, inquiryPageSchema, inquiryTransitionSchema } from "./schemas";
import { changeInquiry, inquiryDetail, listInquiries, retryInquiryEmail } from "./staff";
import { RegistrationAction, registrationActionSchema, registrationDetailSchema, registrationEmailRetrySchema, registrationListSchema,
  registrationSessionListSchema } from "./registration-staff-schemas";
import { changeRegistration, listRegistrations, listRegistrationSessions, registrationDetail,
  registrationSessionDetail, retryRegistrationEmail } from "./registration-staff";

async function staffAction<T>(action: () => Promise<T>) {
  try { return await action(); }
  catch (error) {
    setResponseStatus(error instanceof IntakeError ? error.status : 503);
    throw new Error(error instanceof IntakeError ? error.code : CrmErrorCode.Unavailable);
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
    if (!config.CORPORATE_EMAIL_ENABLED) throw new IntakeError(503, IntakeErrorCode.EmailUnavailable);
    return retryInquiryEmail(getDb(), data.inquiryId, data.jobId, context.actor, config.RESEND_API_KEY);
  }));

export const $listRegistrationSessions = createServerFn({ method: "GET" }).middleware([staffMiddleware])
  .validator(registrationSessionListSchema).handler(({ data }) => staffAction(() => listRegistrationSessions(getDb(), data)));

export const $getRegistrationSession = createServerFn({ method: "GET" }).middleware([staffMiddleware])
  .validator(z.strictObject({ id: z.uuid() })).handler(({ data }) => staffAction(() => registrationSessionDetail(getDb(), data.id)));

export const $listRegistrations = createServerFn({ method: "GET" }).middleware([staffMiddleware])
  .validator(registrationListSchema).handler(({ data }) => staffAction(() => listRegistrations(getDb(), data)));

export const $getRegistration = createServerFn({ method: "GET" }).middleware([staffMiddleware])
  .validator(registrationDetailSchema).handler(({ data }) => staffAction(() => registrationDetail(getDb(), data.id, data)));

export const $changeRegistration = createServerFn({ method: "POST" }).middleware([staffMiddleware])
  .validator(registrationActionSchema).handler(({ data, context }) => staffAction(async () => {
    const config = data.action === RegistrationAction.MarkPaid ? getRegistrationMailConfig() : undefined;
    const db = getDb();
    const { jobs, ...response } = await changeRegistration(db, context.actor, data, config);
    // A delivery failure cannot undo the committed payment verification and saved message.
    if (config?.REGISTRATION_EMAIL_ENABLED) {
      await Promise.allSettled(jobs.map(id => sendEmailJob(db, id, config.RESEND_API_KEY)));
    }
    return response;
  }));

export const $retryRegistrationEmail = createServerFn({ method: "POST" }).middleware([staffMiddleware])
  .validator(registrationEmailRetrySchema).handler(({ data, context }) => staffAction(async () => {
    const config = getRegistrationMailConfig();
    if (!config.REGISTRATION_EMAIL_ENABLED) throw new IntakeError(503, IntakeErrorCode.EmailUnavailable);
    return retryRegistrationEmail(getDb(), data.registrationId, data.jobId, context.actor, config.RESEND_API_KEY);
  }));
