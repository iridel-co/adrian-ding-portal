import { queryOptions } from "@tanstack/react-query";
import type { z } from "zod";
import { $crmAccess, $getInquiry, $listInquiries } from "./functions";
import type { inquiryListSchema } from "./schemas";

export const inquiryQueryKey = ["corporate-inquiries"] as const;
export const crmAccessQueryOptions = () => queryOptions({
  queryKey: ["crm-access"], queryFn: ({ signal }) => $crmAccess({ signal }), retry: false, staleTime: 0, gcTime: 0, refetchInterval: 60000
});
export const inquiriesQueryOptions = (input: z.input<typeof inquiryListSchema>) => queryOptions({
  queryKey: [...inquiryQueryKey, "list", input], queryFn: ({ signal }) => $listInquiries({ data: input, signal }),
  retry: false, staleTime: 0, gcTime: 0, refetchInterval: 60000
});
export const inquiryQueryOptions = (id: string, offset: number) => queryOptions({
  queryKey: [...inquiryQueryKey, "detail", id, offset], queryFn: ({ signal }) => $getInquiry({ data: { id, limit: 20, offset }, signal }),
  retry: false, staleTime: 0, gcTime: 0, refetchInterval: 60000
});
