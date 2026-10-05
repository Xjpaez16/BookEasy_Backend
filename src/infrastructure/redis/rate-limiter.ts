import type Redis from 'ioredis';
import type { RateLimiter } from '../../shared/application/ports';

/**
 * Fixed-window rate limiter in Redis. `consume` increments a counter keyed by
 * action+identity and expires it after the window. Returns false once the
 * limit is exceeded. Simple and sufficient for auth endpoints at MVP scale.
 */
export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const redisKey = `rl:${key}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      await this.redis.expire(redisKey, windowSeconds);
    }
    return count <= limit;
  }
}
