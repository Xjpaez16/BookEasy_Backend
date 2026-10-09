import { db } from '../../infrastructure/db/client';
import { redis } from '../../infrastructure/redis/client';
import { RedisRateLimiter } from '../../infrastructure/redis/rate-limiter';
import { DrizzlePublicCatalogReader } from './adapters/persistence/public-catalog-reader';

/** Wires the public catalog's read adapter + a rate limiter (no auth deps). */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createPublicCatalogContainer() {
  return {
    catalog: new DrizzlePublicCatalogReader(db),
    rateLimiter: new RedisRateLimiter(redis),
  };
}

export type PublicCatalogContainer = ReturnType<typeof createPublicCatalogContainer>;
