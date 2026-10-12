import { corporateInquiryStatus } from "@/db/schema/crm";
import { IntakeError } from "./errors";

export type InquiryStatus = typeof corporateInquiryStatus.enumValues[number];

export const inquiryTransitions: Record<InquiryStatus, readonly InquiryStatus[]> = {
  NEW: ["CONTACTED", "LOST", "SPAM"],
  CONTACTED: ["PROPOSAL_SENT", "LOST"],
  PROPOSAL_SENT: ["WON", "LOST"],
  WON: [],
  LOST: [],
  SPAM: []
};

export function assertInquiryTransition(from: InquiryStatus, to: InquiryStatus) {
  if (!inquiryTransitions[from].includes(to)) throw new IntakeError(409, "invalid_inquiry_transition");
}
