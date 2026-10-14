/**
 * An error we expect and can describe to the client.
 * Anything that is NOT an AppError is treated as a bug and returned as a generic 500.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
