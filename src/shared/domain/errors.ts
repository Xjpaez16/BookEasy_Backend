/**
 * Base domain error hierarchy. Domain and application layers throw these;
 * the HTTP layer maps them to status codes. No framework imports here.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Invariant / validation failure in the domain (422). */
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
}

/** Entity not found (404). */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
}

/** Business-rule conflict, e.g. overlapping appointment (409). */
export class ConflictError extends DomainError {
  readonly code = 'CONFLICT';
}

/** Authentication required or failed (401). */
export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
}

/** Authenticated but not allowed, incl. cross-tenant access (403). */
export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN';
}
