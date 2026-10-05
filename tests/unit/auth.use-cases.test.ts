import { describe, it, expect, beforeAll } from 'bun:test';

// Minimal env so loadConfig() succeeds inside login/refresh use cases.
beforeAll(() => {
  process.env.DATABASE_URL ??= 'postgres://u:p@localhost:5432/db';
  process.env.REDIS_URL ??= 'redis://localhost:6379';
  process.env.ACCESS_TOKEN_SECRET ??= 'test-access-secret-at-least-32-chars-long';
  process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-secret-at-least-32-chars-long';
});

import { registerUser } from '../../src/modules/auth/application/use-cases/register-user';
import { loginUser } from '../../src/modules/auth/application/use-cases/login-user';
import { refreshSession } from '../../src/modules/auth/application/use-cases/refresh-session';
import {
  verifyEmail,
  requestPasswordReset,
  resetPassword,
} from '../../src/modules/auth/application/use-cases/password-and-verification';
import { ConflictError, UnauthorizedError } from '../../src/shared/domain/errors';
import { crypto } from '../../src/infrastructure/security/token-utils';
import {
  InMemoryUserRepository,
  InMemoryRefreshTokenRepository,
  InMemoryVerificationTokenStore,
  CapturingEmailSender,
  FakeHasher,
  FixedClock,
  SeqIdGenerator,
  FakeTokenService,
} from './auth-fakes';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, type inferred
function makeDeps() {
  return {
    users: new InMemoryUserRepository(),
    refreshTokens: new InMemoryRefreshTokenRepository(),
    verificationTokens: new InMemoryVerificationTokenStore(),
    email: new CapturingEmailSender(),
    hasher: new FakeHasher(),
    tokens: new FakeTokenService(),
    clock: new FixedClock(new Date('2026-01-01T00:00:00Z')),
    ids: new SeqIdGenerator(),
  };
}

describe('registerUser', () => {
  it('creates a user and issues an email-verification token', async () => {
    const d = makeDeps();
    const res = await registerUser(
      { email: 'Owner@Example.com ', password: 'supersecret', fullName: 'Owner' },
      d,
    );
    expect(res.userId).toBe('id-1');
    const user = await d.users.findByEmail('owner@example.com');
    expect(user).not.toBeNull();
    expect(d.email.verifications).toHaveLength(1);
    expect(d.email.verifications[0]!.to).toBe('owner@example.com');
  });

  it('rejects a duplicate email', async () => {
    const d = makeDeps();
    const input = { email: 'dup@example.com', password: 'supersecret', fullName: 'A' };
    await registerUser(input, d);
    await expect(registerUser(input, d)).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('loginUser', () => {
  it('returns tokens for valid credentials', async () => {
    const d = makeDeps();
    await registerUser({ email: 'a@b.com', password: 'supersecret', fullName: 'A' }, d);
    const res = await loginUser({ email: 'a@b.com', password: 'supersecret' }, d);
    expect(res.accessToken).toBe('access:id-1');
    expect(res.refreshToken).toBeTruthy();
    expect(d.refreshTokens.rows).toHaveLength(1);
  });

  it('rejects a wrong password', async () => {
    const d = makeDeps();
    await registerUser({ email: 'a@b.com', password: 'supersecret', fullName: 'A' }, d);
    await expect(
      loginUser({ email: 'a@b.com', password: 'wrong' }, d),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects an unknown user without leaking existence', async () => {
    const d = makeDeps();
    await expect(
      loginUser({ email: 'nobody@b.com', password: 'whatever' }, d),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('refreshSession rotation', () => {
  it('rotates the refresh token and revokes the old one', async () => {
    const d = makeDeps();
    await registerUser({ email: 'a@b.com', password: 'supersecret', fullName: 'A' }, d);
    const login = await loginUser({ email: 'a@b.com', password: 'supersecret' }, d);

    const refreshed = await refreshSession({ refreshToken: login.refreshToken }, d);
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);

    const oldRow = d.refreshTokens.rows.find(
      (r) => r.tokenHash === d.tokens.hashRefreshToken(login.refreshToken),
    );
    expect(oldRow!.revokedAt).not.toBeNull();
  });

  it('detects reuse of a revoked token and revokes the whole family', async () => {
    const d = makeDeps();
    await registerUser({ email: 'a@b.com', password: 'supersecret', fullName: 'A' }, d);
    const login = await loginUser({ email: 'a@b.com', password: 'supersecret' }, d);
    await refreshSession({ refreshToken: login.refreshToken }, d);

    // Reusing the original (now revoked) token must fail...
    await expect(
      refreshSession({ refreshToken: login.refreshToken }, d),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    // ...and revoke every refresh token for the user.
    expect(d.refreshTokens.rows.every((r) => r.revokedAt !== null)).toBe(true);
  });
});

describe('email verification + password reset', () => {
  it('verifies an email with a valid token', async () => {
    const d = makeDeps();
    await registerUser({ email: 'a@b.com', password: 'supersecret', fullName: 'A' }, d);
    const token = d.email.verifications[0]!.token;
    await verifyEmail({ token }, d);
    const user = await d.users.findByEmail('a@b.com');
    expect(user!.isEmailVerified).toBe(true);
  });

  it('password reset revokes sessions and changes the hash', async () => {
    const d = makeDeps();
    await registerUser({ email: 'a@b.com', password: 'oldsecret1', fullName: 'A' }, d);
    await loginUser({ email: 'a@b.com', password: 'oldsecret1' }, d);
    await requestPasswordReset({ email: 'a@b.com' }, d);
    const token = d.email.resets[0]!.token;

    await resetPassword({ token, newPassword: 'newsecret1' }, d);
    expect(d.refreshTokens.rows.every((r) => r.revokedAt !== null)).toBe(true);
    await expect(
      loginUser({ email: 'a@b.com', password: 'oldsecret1' }, d),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    const ok = await loginUser({ email: 'a@b.com', password: 'newsecret1' }, d);
    expect(ok.accessToken).toBeTruthy();
  });

  it('does not reveal whether an email exists on forgot-password', async () => {
    const d = makeDeps();
    await requestPasswordReset({ email: 'ghost@example.com' }, d);
    expect(d.email.resets).toHaveLength(0);
  });
});

describe('token hashing', () => {
  it('sha256 is stable', () => {
    expect(crypto.sha256('abc')).toBe(crypto.sha256('abc'));
    expect(crypto.sha256('abc')).not.toBe(crypto.sha256('abd'));
  });
});
