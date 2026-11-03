const FALLBACK_MESSAGE = "Something went wrong. Try again.";

type ValidationIssue = {
  path?: unknown;
  message?: unknown;
};

type IssueMessage = {
  field: string | null;
  message: string;
};

export type FormErrors = {
  byField: Partial<Record<string, string[]>>;
  general: string[];
};

/* Maps a server field name to the form field that edits it, e.g. heroMediaId to heroMedia. */
export type FieldAliases = Partial<Record<string, string>>;

export const NO_FORM_ERRORS: FormErrors = {
  byField: {},
  general: []
};

/* The field an issue belongs to is the last name in its path, e.g. ["values", "outcomes", 2]. */
function issueField(path: unknown) {
  if (!Array.isArray(path)) return null;

  const names = path.filter((segment): segment is string => typeof segment === "string");
  return names.at(-1) ?? null;
}

/* Server validation errors arrive as a JSON list of issues. */
function parseIssues(message: string): IssueMessage[] | null {
  if (!message.startsWith("[")) return null;

  try {
    const issues: unknown = JSON.parse(message);
    if (!Array.isArray(issues)) return null;

    return (issues as ValidationIssue[])
      .filter((issue) => typeof issue?.message === "string")
      .map((issue) => ({
        field: issueField(issue.path),
        message: issue.message as string
      }));
  } catch {
    return null;
  }
}

/* An error that carries validation issues in the same shape the server sends. */
export function validationError(issues: { path: string[]; message: string }[]) {
  return new Error(JSON.stringify(issues));
}

/* A message that is safe and readable to show in a toast. */
export function errorMessage(error: unknown) {
  if (!(error instanceof Error) || !error.message) return FALLBACK_MESSAGE;

  const [first] = parseIssues(error.message) ?? [];
  return first?.message ?? error.message;
}

/* Every message of an error, grouped by form field. Messages for unknown fields are general. */
export function formErrors(
  error: unknown,
  fieldNames: readonly string[],
  aliases: FieldAliases = {}
): FormErrors {
  const issues = error instanceof Error ? parseIssues(error.message) : null;
  if (!issues || issues.length === 0) {
    return {
      byField: {},
      general: [errorMessage(error)]
    };
  }

  const result: FormErrors = {
    byField: {},
    general: []
  };

  for (const issue of issues) {
    const field = issue.field && (aliases[issue.field] ?? issue.field);
    const { message } = issue;

    if (field && fieldNames.includes(field)) {
      result.byField[field] = [...(result.byField[field] ?? []), message];
    } else {
      result.general.push(message);
    }
  }

  return result;
}
