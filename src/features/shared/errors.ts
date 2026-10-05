/* A save that fails because of user input. The message is safe to show in the UI. */
export class CmsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CmsValidationError";
  }
}
