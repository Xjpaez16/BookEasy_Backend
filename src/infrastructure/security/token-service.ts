import { createHmac, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type {
  TokenService,
  AccessTokenClaims,
} from '../../shared/application/ports';
import { UnauthorizedError } from '../../shared/domain/errors';
import { loadConfig } from '../../config/env';

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function parseTtlSeconds(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl.trim());
  if (!m) return 900;
  const value = Number(m[1]);
  const unit = m[2];
  const mult = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return value * mult;
}

/**
 * Access tokens: compact HS256 JWTs (short-lived).
 * Refresh tokens: opaque random strings; only their SHA-256 is persisted.
 */
export class HmacTokenService implements TokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtlSeconds: number;

  constructor() {
    const config = loadConfig();
    this.accessSecret = config.ACCESS_TOKEN_SECRET;
    this.refreshSecret = config.REFRESH_TOKEN_SECRET;
    this.accessTtlSeconds = parseTtlSeconds(config.ACCESS_TOKEN_TTL);
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      ...claims,
      iat: now,
      exp: now + this.accessTtlSeconds,
    };
    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(payload));
    const data = `${headerB64}.${payloadB64}`;
    const sig = createHmac('sha256', this.accessSecret).update(data).digest('base64url');
    return `${data}.${sig}`;
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedError('Malformed token');
    const [headerB64, payloadB64, sig] = parts as [string, string, string];
    const data = `${headerB64}.${payloadB64}`;
    const expected = createHmac('sha256', this.accessSecret).update(data).digest('base64url');

    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedError('Invalid token signature');
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      sub: string;
      businessId: string | null;
      role: string | null;
      exp: number;
    };
    if (payload.exp * 1000 <= Date.now()) {
      throw new UnauthorizedError('Token expired');
    }
    return { sub: payload.sub, businessId: payload.businessId, role: payload.role };
  }

  issueRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHash('sha256')
      .update(`${token}${this.refreshSecret}`)
      .digest('hex');
  }
}
