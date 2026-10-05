import { randomBytes, createHash } from 'node:crypto';

/**
 * Small crypto helpers used by auth use cases. Kept framework-agnostic so the
 * application layer depends on a stable surface rather than Node internals.
 */
export const crypto = {
  /** URL-safe random opaque token (256 bits). */
  randomToken(): string {
    return randomBytes(32).toString('base64url');
  },
  /** SHA-256 hex digest. Used to store a hash of one-time/refresh tokens. */
  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  },
};
