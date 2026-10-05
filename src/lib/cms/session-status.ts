import type { sessionStatus } from "@/db/schema";
import { CmsValidationError } from "@/lib/cms/errors";

export type SessionStatus = (typeof sessionStatus.enumValues)[number];

const ALLOWED_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  draft: ["open"],
  open: ["closed", "cancelled"],
  closed: ["open", "cancelled"],
  cancelled: []
};

type TransitionContext = {
  hasStarted: boolean;
  hasEnded: boolean;
};

/* The statuses a session can move to now. */
export function allowedSessionTransitions(from: SessionStatus, context: TransitionContext) {
  return ALLOWED_TRANSITIONS[from].filter((to) => {
    if (from === "closed" && to === "open") return !context.hasStarted;
    if (context.hasEnded) return false;
    return true;
  });
}

export function assertSessionTransition(
  from: SessionStatus,
  to: SessionStatus,
  context: TransitionContext
) {
  if (allowedSessionTransitions(from, context).includes(to)) return;

  if (from === "closed" && to === "open" && context.hasStarted) {
    throw new CmsValidationError("This session has started, so it can't reopen.");
  }
  if (context.hasEnded) {
    throw new CmsValidationError("This session is past, so its status can't change.");
  }
  throw new CmsValidationError(`Can't change a session from ${from} to ${to}.`);
}
