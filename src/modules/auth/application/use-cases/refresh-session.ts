import { UnauthorizedError } from '../../../../shared/domain/errors';
import type { Clock, TokenService } from '../../../../shared/application/ports';
import type { UserRepository, RefreshTokenRepository } from '../ports';
import { loadConfig } from '../../../../config/env';

export interface RefreshSessionInput {
  refreshToken: string;
}

export interface RefreshSessionDeps {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  tokens: TokenService;
  clock: Clock;
}

export interface RefreshSessionResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  userId: string;
}

/**
 * Rotating refresh: validates the presented token, REVOKES it, and issues a
 * fresh pair. A reused (already-revoked) or expired token is rejected and, as
 * a reuse-detection measure, all of the user's refresh tokens are revoked.
 */
export async function refreshSession(
  input: RefreshSessionInput,
  deps: RefreshSessionDeps,
): Promise<RefreshSessionResult> {
  const config = loadConfig();
  const now = deps.clock.now();
  const presentedHash = deps.tokens.hashRefreshToken(input.refreshToken);

  const stored = await deps.refreshTokens.findByHash(presentedHash);
  if (!stored) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  if (stored.revokedAt) {
    // Token reuse detected — revoke the whole family defensively.
    await deps.refreshTokens.revokeAllForUser(stored.userId, now);
    throw new UnauthorizedError('Refresh token already used');
  }

  if (stored.expiresAt.getTime() <= now.getTime()) {
    throw new UnauthorizedError('Refresh token expired');
  }

  const user = await deps.users.findById(stored.userId);
  if (!user) {
    throw new UnauthorizedError('Invalid refresh token');
  }

  // Rotate: revoke the old, mint a new one.
  await deps.refreshTokens.revoke(stored.id, now);

  const { token: refreshToken, hash } = deps.tokens.issueRefreshToken();
  const refreshExpiresAt = new Date(
    now.getTime() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  await deps.refreshTokens.create({
    userId: user.id,
    tokenHash: hash,
    expiresAt: refreshExpiresAt,
  });

  const accessToken = await deps.tokens.signAccessToken({
    sub: user.id,
    businessId: null,
    role: null,
  });

  return { accessToken, refreshToken, refreshExpiresAt, userId: user.id };
}
