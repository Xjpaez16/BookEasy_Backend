import {
  DomainError,
  ValidationError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from '../../shared/domain/errors';

export interface HttpErrorBody {
  error: { code: string; message: string };
}

/** Maps a domain error to an HTTP status. Unknown errors become 500. */
export function statusForError(err: unknown): number {
  if (err instanceof ValidationError) return 422;
  if (err instanceof UnauthorizedError) return 401;
  if (err instanceof ForbiddenError) return 403;
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ConflictError) return 409;
  return 500;
}

/**
 * Builds a safe response body. In production, 500s never leak internals;
 * domain errors expose their stable code + message only.
 */
export function bodyForError(err: unknown, isProduction: boolean): HttpErrorBody {
  if (err instanceof DomainError) {
    return { error: { code: err.code, message: err.message } };
  }
  return {
    error: {
      code: 'INTERNAL_ERROR',
      message: isProduction ? 'Internal server error' : String((err as Error)?.message ?? err),
    },
  };
}
