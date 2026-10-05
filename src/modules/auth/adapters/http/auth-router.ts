import { Elysia } from 'elysia';
import { ValidationError, UnauthorizedError } from '../../../../shared/domain/errors';
import { createAuthContainer } from '../../container';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  requestResetSchema,
  resetPasswordSchema,
} from './schemas';
import { registerUser } from '../../application/use-cases/register-user';
import { loginUser } from '../../application/use-cases/login-user';
import { refreshSession } from '../../application/use-cases/refresh-session';
import {
  verifyEmail,
  requestPasswordReset,
  resetPassword,
} from '../../application/use-cases/password-and-verification';

const REFRESH_COOKIE = 'refresh_token';

const container = createAuthContainer();

/** Parses a body with Zod, mapping failures to a domain ValidationError. */
function parse<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success || result.data === undefined) {
    throw new ValidationError('Invalid request body');
  }
  return result.data;
}

function clientKey(request: Request, suffix: string): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  return `${suffix}:${ip}`;
}

interface CookieJar {
  [name: string]: {
    value?: string;
    set: (opts: Record<string, unknown>) => void;
    remove: () => void;
  };
}

function setRefreshCookie(cookie: CookieJar, token: string, expires: Date): void {
  cookie[REFRESH_COOKIE]?.set({
    value: token,
    httpOnly: true,
    secure: container.config.COOKIE_SECURE,
    sameSite: 'lax',
    path: '/api/v1/auth',
    expires,
    ...(container.config.COOKIE_DOMAIN ? { domain: container.config.COOKIE_DOMAIN } : {}),
  });
}

/**
 * Auth router. Controllers only: validate (Zod) → rate-limit → call use case →
 * map result/cookies to HTTP. No business logic or SQL here.
 */
export const authRouter = new Elysia({ prefix: '/api/v1/auth' })
  .post('/register', async ({ body, request, set }) => {
    const allowed = await container.rateLimiter.consume(clientKey(request, 'register'), 10, 3600);
    if (!allowed) throw new ValidationError('Too many attempts, try again later');

    const input = parse(registerSchema, body);
    const result = await registerUser(input, container);
    set.status = 201;
    return { userId: result.userId };
  })

  .post('/login', async ({ body, request, cookie }) => {
    const allowed = await container.rateLimiter.consume(clientKey(request, 'login'), 10, 300);
    if (!allowed) throw new UnauthorizedError('Too many attempts, try again later');

    const input = parse(loginSchema, body);
    const result = await loginUser(input, container);
    setRefreshCookie(cookie as unknown as CookieJar, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken, userId: result.userId };
  })

  .post('/refresh', async ({ cookie }) => {
    const jar = cookie as unknown as CookieJar;
    const presented = jar[REFRESH_COOKIE]?.value;
    if (!presented) throw new UnauthorizedError('Missing refresh token');

    const result = await refreshSession({ refreshToken: presented }, container);
    setRefreshCookie(jar, result.refreshToken, result.refreshExpiresAt);
    return { accessToken: result.accessToken, userId: result.userId };
  })

  .post('/logout', async ({ cookie }) => {
    const jar = cookie as unknown as CookieJar;
    const presented = jar[REFRESH_COOKIE]?.value;
    if (presented) {
      const stored = await container.refreshTokens.findByHash(
        container.tokens.hashRefreshToken(presented),
      );
      if (stored && !stored.revokedAt) {
        await container.refreshTokens.revoke(stored.id, container.clock.now());
      }
    }
    jar[REFRESH_COOKIE]?.remove();
    return { ok: true };
  })

  .post('/verify-email', async ({ body }) => {
    const input = parse(verifyEmailSchema, body);
    await verifyEmail(input, container);
    return { ok: true };
  })

  .post('/password/forgot', async ({ body, request }) => {
    const allowed = await container.rateLimiter.consume(clientKey(request, 'forgot'), 5, 3600);
    if (!allowed) throw new ValidationError('Too many attempts, try again later');

    const input = parse(requestResetSchema, body);
    await requestPasswordReset(input, container);
    // Always 200 to avoid account enumeration.
    return { ok: true };
  })

  .post('/password/reset', async ({ body }) => {
    const input = parse(resetPasswordSchema, body);
    await resetPassword(input, container);
    return { ok: true };
  });
