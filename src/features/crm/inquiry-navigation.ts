import { inquiryListSchema } from "./schemas";
import { crmPaginationSearchSchema } from "./pagination";

export const inquirySearchSchema = inquiryListSchema.pick({ status: true, search: true, sort: true, direction: true }).and(crmPaginationSearchSchema);
