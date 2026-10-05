import type Redis from 'ioredis';
import type {
  VerificationTokenStore,
  VerificationPurpose,
} from '../../application/ports';

/**
 * Single-use verification/reset tokens kept in Redis with a TTL.
 * Key = purpose:hash → value = userId. `consume` deletes atomically.
 */
export class RedisVerificationTokenStore implements VerificationTokenStore {
  constructor(private readonly redis: Redis) {}

  private key(purpose: VerificationPurpose, tokenHash: string): string {
    return `verif:${purpose}:${tokenHash}`;
  }

  async issue(data: {
    userId: string;
    purpose: VerificationPurpose;
    tokenHash: string;
    ttlSeconds: number;
  }): Promise<void> {
    await this.redis.set(
      this.key(data.purpose, data.tokenHash),
      data.userId,
      'EX',
      data.ttlSeconds,
    );
  }

  async consume(
    purpose: VerificationPurpose,
    tokenHash: string,
  ): Promise<string | null> {
    const key = this.key(purpose, tokenHash);
    // GETDEL is atomic single-use consumption (Redis >= 6.2).
    const userId = await this.redis.getdel(key);
    return userId ?? null;
  }
}
