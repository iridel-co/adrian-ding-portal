import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getDb } from "@/db";
import { staffMiddleware } from "@/lib/access.functions";
import { getRegistrationPaymentAccountFallbackId } from "./config";
import {
  activatePaymentAccount,
  archivePaymentAccount,
  createPaymentAccount,
  listPaymentAccounts,
  restorePaymentAccount,
  updatePaymentAccount
} from "./payment-accounts";
import {
  createPaymentAccountInput,
  paymentAccountIdInput,
  paymentAccountListInput,
  updatePaymentAccountInput
} from "./payment-accounts-schemas";

export const $listPaymentAccounts = createServerFn({ method: "GET" })
  .middleware([staffMiddleware])
  .validator(paymentAccountListInput)
  .handler(({ data }) => listPaymentAccounts(getDb(), data, getRegistrationPaymentAccountFallbackId()));

export const $createPaymentAccount = createServerFn({ method: "POST" })
  .middleware([staffMiddleware])
  .validator(createPaymentAccountInput)
  .handler(({ data, context }) => createPaymentAccount(getDb(), context.actor, data));

export const $updatePaymentAccount = createServerFn({ method: "POST" })
  .middleware([staffMiddleware])
  .validator(updatePaymentAccountInput)
  .handler(({ data, context }) => updatePaymentAccount(getDb(), context.actor, data));

export const $activatePaymentAccount = createServerFn({ method: "POST" })
  .middleware([staffMiddleware])
  .validator(paymentAccountIdInput)
  .handler(({ data, context }) => activatePaymentAccount(getDb(), context.actor, data));

export const $archivePaymentAccount = createServerFn({ method: "POST" })
  .middleware([staffMiddleware])
  .validator(paymentAccountIdInput)
  .handler(({ data, context }) => archivePaymentAccount(getDb(), context.actor, data, getRegistrationPaymentAccountFallbackId()));

export const $restorePaymentAccount = createServerFn({ method: "POST" })
  .middleware([staffMiddleware])
  .validator(paymentAccountIdInput)
  .handler(({ data, context }) => restorePaymentAccount(getDb(), context.actor, data));

export type PaymentAccount = Awaited<ReturnType<typeof $listPaymentAccounts>>["items"][number];

export const paymentAccountsQueryOptions = (input: z.input<typeof paymentAccountListInput> = {}) =>
  queryOptions({
    queryKey: ["payment-accounts", input],
    queryFn: () => $listPaymentAccounts({ data: input })
  });
