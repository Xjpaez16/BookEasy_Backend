import { User } from '../../src/modules/auth/domain/user';
import type {
  UserRepository,
  RefreshTokenRepository,
  StoredRefreshToken,
  VerificationTokenStore,
  VerificationPurpose,
  EmailSender,
} from '../../src/modules/auth/application/ports';
import type {
  Clock,
  IdGenerator,
  PasswordHasher,
  TokenService,
  AccessTokenClaims,
} from '../../src/shared/application/ports';

export class InMemoryUserRepository implements UserRepository {
  private byId = new Map<string, User>();
  private byEmail = new Map<string, string>();

  async findById(id: string): Promise<User | null> {
    return this.byId.get(id) ?? null;
  }
  async findByEmail(email: string): Promise<User | null> {
    const id = this.byEmail.get(email);
    return id ? (this.byId.get(id) ?? null) : null;
  }
  async save(user: User): Promise<void> {
    this.byId.set(user.id, user);
    this.byEmail.set(user.email, user.id);
  }
}

export class InMemoryRefreshTokenRepository implements RefreshTokenRepository {
  rows: StoredRefreshToken[] = [];
  private seq = 0;

  async create(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<void> {
    this.rows.push({
      id: `rt-${++this.seq}`,
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      revokedAt: null,
    });
  }
  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    return this.rows.find((r) => r.tokenHash === tokenHash) ?? null;
  }
  async revoke(id: string, at: Date): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row) row.revokedAt = at;
  }
  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    for (const r of this.rows) if (r.userId === userId && !r.revokedAt) r.revokedAt = at;
  }
}

export class InMemoryVerificationTokenStore implements VerificationTokenStore {
  private store = new Map<string, string>();
  async issue(data: {
    userId: string;
    purpose: VerificationPurpose;
    tokenHash: string;
    ttlSeconds: number;
  }): Promise<void> {
    this.store.set(`${data.purpose}:${data.tokenHash}`, data.userId);
  }
  async consume(purpose: VerificationPurpose, tokenHash: string): Promise<string | null> {
    const key = `${purpose}:${tokenHash}`;
    const userId = this.store.get(key) ?? null;
    if (userId) this.store.delete(key);
    return userId;
  }
}

export class CapturingEmailSender implements EmailSender {
  verifications: Array<{ to: string; token: string }> = [];
  resets: Array<{ to: string; token: string }> = [];
  async sendEmailVerification(to: string, token: string): Promise<void> {
    this.verifications.push({ to, token });
  }
  async sendPasswordReset(to: string, token: string): Promise<void> {
    this.resets.push({ to, token });
  }
}

/** Deterministic, fast hasher for tests (NOT for production). */
export class FakeHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }
  async verify(plain: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plain}`;
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SeqIdGenerator implements IdGenerator {
  private n = 0;
  generate(): string {
    return `id-${++this.n}`;
  }
}

/** Fake token service: access token encodes the sub; refresh is a counter. */
export class FakeTokenService implements TokenService {
  private refreshSeq = 0;
  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return `access:${claims.sub}`;
  }
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    return { sub: token.replace('access:', ''), businessId: null, role: null };
  }
  issueRefreshToken(): { token: string; hash: string } {
    const token = `refresh-${++this.refreshSeq}`;
    return { token, hash: this.hashRefreshToken(token) };
  }
  hashRefreshToken(token: string): string {
    return `h:${token}`;
  }
}
