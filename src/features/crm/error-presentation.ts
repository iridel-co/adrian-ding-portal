import { AccessErrorCode } from "@/lib/access-errors";
import { IntakeErrorCode } from "./errors";

export const commonErrorMessages: Record<string, string> = {
  [AccessErrorCode.Unauthorized]: "Your session has ended. Sign in again.",
  [IntakeErrorCode.OriginNotAllowed]: "This request was blocked. Open the portal at its configured address and try again."
};

export const fallbackErrorMessage = "The request could not be completed. Try again.";
