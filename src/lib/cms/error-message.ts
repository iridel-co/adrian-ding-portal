const FALLBACK_MESSAGE = "Something went wrong. Try again.";

type ValidationIssue = {
  message?: unknown;
};

/* Server validation errors arrive as a JSON list of issues. Show the first message instead. */
function firstIssueMessage(message: string) {
  if (!message.startsWith("[")) return null;

  try {
    const issues: unknown = JSON.parse(message);
    if (!Array.isArray(issues)) return null;

    const [first] = issues as ValidationIssue[];
    return typeof first?.message === "string" ? first.message : null;
  } catch {
    return null;
  }
}

/* A message that is safe and readable to show in a toast. */
export function errorMessage(error: unknown) {
  if (!(error instanceof Error) || !error.message) return FALLBACK_MESSAGE;
  return firstIssueMessage(error.message) ?? error.message;
}
