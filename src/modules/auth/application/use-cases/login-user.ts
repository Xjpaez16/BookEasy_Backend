import { normalizeEmail } from '../../domain/user';
import { UnauthorizedError } from '../../../../shared/domain/errors';
import type {
  Clock,
  PasswordHasher,
  TokenService,
} from '../../../../shared/application/ports';
import type { UserRepository, RefreshTokenRepository } from '../ports';
import { loadConfig } from '../../../../config/env';

export interface LoginUserInput {
  email: string;
  password: string;
}

export interface LoginUserDeps {
  users: UserRepository;
  refreshTokens: RefreshTokenRepository;
  hasher: PasswordHasher;
  tokens: TokenService;
  clock: Clock;
}

export interface LoginUserResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  userId: string;
}

/**
 * Authenticates a user and issues an access token + a rotating refresh token.
 * Timing: always runs a hash verify to avoid user-enumeration via response time.
 */
export async function loginUser(
  input: LoginUserInput,
  deps: LoginUserDeps,
): Promise<LoginUserResult> {
  const config = loadConfig();
  const email = normalizeEmail(input.email);
  const user = await deps.users.findByEmail(email);

  // Constant-ish work whether or not the user exists.
  const hashToCheck =
    user?.passwordHash ??
    '$argon2id$v=19$m=65536,t=3,p=4$0000000000000000000000$0000000000000000000000000000000000000000000';
  const ok = await deps.hasher.verify(input.password, hashToCheck);

  if (!user || !ok) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const now = deps.clock.now();
  const accessToken = await deps.tokens.signAccessToken({
    sub: user.id,
    businessId: null,
    role: null,
  });

  const { token: refreshToken, hash } = deps.tokens.issueRefreshToken();
  const refreshExpiresAt = new Date(
    now.getTime() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  );
  await deps.refreshTokens.create({
    userId: user.id,
    tokenHash: hash,
    expiresAt: refreshExpiresAt,
  });

  return { accessToken, refreshToken, refreshExpiresAt, userId: user.id };
}
