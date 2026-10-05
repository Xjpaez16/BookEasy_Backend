import { db } from '../../infrastructure/db/client';
import { redis } from '../../infrastructure/redis/client';
import { Argon2PasswordHasher } from '../../infrastructure/security/password-hasher';
import { HmacTokenService } from '../../infrastructure/security/token-service';
import {
  SystemClock,
  UuidGenerator,
} from '../../infrastructure/security/system-services';
import { ConsoleEmailSender } from '../../infrastructure/jobs/email-sender';
import { RedisRateLimiter } from '../../infrastructure/redis/rate-limiter';
import { loadConfig } from '../../config/env';

import { DrizzleUserRepository } from './adapters/persistence/user-repository';
import { DrizzleRefreshTokenRepository } from './adapters/persistence/refresh-token-repository';
import { RedisVerificationTokenStore } from './adapters/persistence/verification-token-store';

/** Wires the concrete adapters the auth use cases depend on. */
// Return type intentionally inferred: it is the container shape (AuthContainer).
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createAuthContainer() {
  const config = loadConfig();
  return {
    users: new DrizzleUserRepository(db),
    refreshTokens: new DrizzleRefreshTokenRepository(db),
    verificationTokens: new RedisVerificationTokenStore(redis),
    hasher: new Argon2PasswordHasher(),
    tokens: new HmacTokenService(),
    clock: new SystemClock(),
    ids: new UuidGenerator(),
    email: new ConsoleEmailSender(config.NODE_ENV === 'production'),
    rateLimiter: new RedisRateLimiter(redis),
    config,
  };
}

export type AuthContainer = ReturnType<typeof createAuthContainer>;
