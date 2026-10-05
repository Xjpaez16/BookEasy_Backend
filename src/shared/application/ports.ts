/**
 * Cross-cutting application ports (interfaces). Concrete implementations
 * live in infrastructure/adapters. The application layer depends only on these.
 */

export interface Clock {
  /** Current instant in UTC. */
  now(): Date;
}

export interface IdGenerator {
  /** Returns a new unique id (UUID v4). */
  generate(): string;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface AccessTokenClaims {
  sub: string; // user id
  businessId: string | null;
  role: string | null;
}

export interface TokenService {
  signAccessToken(claims: AccessTokenClaims): Promise<string>;
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
  /** Opaque refresh token value + its hash for storage. */
  issueRefreshToken(): { token: string; hash: string };
  hashRefreshToken(token: string): string;
}

/**
 * Transaction boundary. A use case that writes across repositories runs
 * inside `withTransaction` so the whole unit commits or rolls back atomically.
 */
export interface UnitOfWork {
  withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T>;
}

/** Opaque handle passed to repositories to enlist them in a transaction. */
export interface TransactionContext {
  readonly _brand: 'TransactionContext';
}

export interface RateLimiter {
  /** Returns true if the action is allowed, false if the limit is exceeded. */
  consume(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}
