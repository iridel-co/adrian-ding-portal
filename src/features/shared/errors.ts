/* A save that fails because of user input. The message is safe to show in the UI. */
export class CmsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmsValidationError";
  }
}

/* A requested item doesn't exist or isn't visible to the caller. */
export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}
