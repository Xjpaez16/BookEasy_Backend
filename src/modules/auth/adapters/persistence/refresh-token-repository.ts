import { eq, and, isNull } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import type {
  RefreshTokenRepository,
  StoredRefreshToken,
} from '../../application/ports';

export class DrizzleRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly db: Database) {}

  async create(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.db.insert(schema.refreshTokens).values({
      userId: data.userId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
    });
  }

  async findByHash(tokenHash: string): Promise<StoredRefreshToken | null> {
    const rows = await this.db
      .select()
      .from(schema.refreshTokens)
      .where(eq(schema.refreshTokens.tokenHash, tokenHash))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }

  async revoke(id: string, at: Date): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: at })
      .where(eq(schema.refreshTokens.id, id));
  }

  async revokeAllForUser(userId: string, at: Date): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: at })
      .where(
        and(
          eq(schema.refreshTokens.userId, userId),
          isNull(schema.refreshTokens.revokedAt),
        ),
      );
  }
}
