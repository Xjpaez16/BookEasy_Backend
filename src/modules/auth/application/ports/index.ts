import type { User } from '../../domain/user';
import type { TransactionContext } from '../../../../shared/application/ports';

export interface UserRepository {
  findById(id: string, tx?: TransactionContext): Promise<User | null>;
  findByEmail(email: string, tx?: TransactionContext): Promise<User | null>;
  save(user: User, tx?: TransactionContext): Promise<void>;
}

export interface StoredRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface RefreshTokenRepository {
  create(
    data: { userId: string; tokenHash: string; expiresAt: Date },
    tx?: TransactionContext,
  ): Promise<void>;
  findByHash(tokenHash: string, tx?: TransactionContext): Promise<StoredRefreshToken | null>;
  revoke(id: string, at: Date, tx?: TransactionContext): Promise<void>;
  revokeAllForUser(userId: string, at: Date, tx?: TransactionContext): Promise<void>;
}

export type VerificationPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

export interface VerificationTokenStore {
  /** Stores a hashed one-time token with a TTL. Returns nothing. */
  issue(data: {
    userId: string;
    purpose: VerificationPurpose;
    tokenHash: string;
    ttlSeconds: number;
  }): Promise<void>;
  /** Consumes a token (single use). Returns the userId if valid, else null. */
  consume(purpose: VerificationPurpose, tokenHash: string): Promise<string | null>;
}

export interface EmailSender {
  sendEmailVerification(to: string, token: string): Promise<void>;
  sendPasswordReset(to: string, token: string): Promise<void>;
}
