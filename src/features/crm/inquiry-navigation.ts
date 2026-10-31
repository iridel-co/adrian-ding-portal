import { inquiryListSchema } from "./schemas";
import { crmPaginationSearchSchema } from "./pagination";

export const inquirySearchSchema = inquiryListSchema.pick({ status: true, search: true }).and(crmPaginationSearchSchema);
