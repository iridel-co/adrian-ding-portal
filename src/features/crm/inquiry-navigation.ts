import { inquiryListSchema } from "./schemas";
import { paginationSearchSchema } from "@/features/shared/pagination";

export const inquirySearchSchema = inquiryListSchema.pick({ status: true, search: true, sort: true, direction: true }).and(paginationSearchSchema);
