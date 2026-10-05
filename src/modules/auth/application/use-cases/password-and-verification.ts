import { normalizeEmail } from '../../domain/user';
import { ValidationError } from '../../../../shared/domain/errors';
import type { Clock, PasswordHasher } from '../../../../shared/application/ports';
import type {
  UserRepository,
  VerificationTokenStore,
  RefreshTokenRepository,
  EmailSender,
} from '../ports';
import { crypto } from '../../../../infrastructure/security/token-utils';

const PASSWORD_RESET_TTL_SECONDS = 60 * 60; // 1h

/** Verifies an email using a single-use token. Idempotent on an already-verified user. */
export async function verifyEmail(
  input: { token: string },
  deps: { users: UserRepository; verificationTokens: VerificationTokenStore; clock: Clock },
): Promise<void> {
  const userId = await deps.verificationTokens.consume(
    'EMAIL_VERIFICATION',
    crypto.sha256(input.token),
  );
  if (!userId) throw new ValidationError('Invalid or expired verification token');

  const user = await deps.users.findById(userId);
  if (!user) throw new ValidationError('Invalid or expired verification token');

  user.verifyEmail(deps.clock.now());
  await deps.users.save(user);
}

/**
 * Requests a password reset. ALWAYS returns success regardless of whether the
 * email exists, to avoid account enumeration. Only sends mail if it exists.
 */
export async function requestPasswordReset(
  input: { email: string },
  deps: {
    users: UserRepository;
    verificationTokens: VerificationTokenStore;
    email: EmailSender;
  },
): Promise<void> {
  const email = normalizeEmail(input.email);
  const user = await deps.users.findByEmail(email);
  if (!user) return;

  const rawToken = crypto.randomToken();
  await deps.verificationTokens.issue({
    userId: user.id,
    purpose: 'PASSWORD_RESET',
    tokenHash: crypto.sha256(rawToken),
    ttlSeconds: PASSWORD_RESET_TTL_SECONDS,
  });
  await deps.email.sendPasswordReset(user.email, rawToken);
}

/** Resets a password with a single-use token and revokes all refresh tokens. */
export async function resetPassword(
  input: { token: string; newPassword: string },
  deps: {
    users: UserRepository;
    refreshTokens: RefreshTokenRepository;
    verificationTokens: VerificationTokenStore;
    hasher: PasswordHasher;
    clock: Clock;
  },
): Promise<void> {
  if (input.newPassword.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }
  const userId = await deps.verificationTokens.consume(
    'PASSWORD_RESET',
    crypto.sha256(input.token),
  );
  if (!userId) throw new ValidationError('Invalid or expired reset token');

  const user = await deps.users.findById(userId);
  if (!user) throw new ValidationError('Invalid or expired reset token');

  user.changePassword(await deps.hasher.hash(input.newPassword));
  await deps.users.save(user);
  // Invalidate existing sessions after a password change.
  await deps.refreshTokens.revokeAllForUser(user.id, deps.clock.now());
}
