import { z } from "zod";

export const sortDirection = z.enum(["asc", "desc"]).default("desc");
export const inquirySort = z.enum(["company", "program", "status", "createdAt", "slaDueAt"]).default("createdAt");
export const workshopSort = z.enum(["workshopTitle", "date", "venueName", "reserved", "paid"]).default("date");
export const registrantSort = z.enum(["fullName", "status", "priceCentavos", "createdAt"]).default("createdAt");
