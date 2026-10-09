import { Elysia } from 'elysia';
import { ValidationError } from '../../../../shared/domain/errors';
import { createPublicCatalogContainer } from '../../container';
import {
  listPublicBusinesses,
  getPublicStorefront,
} from '../../application/use-cases/public-catalog';

const container = createPublicCatalogContainer();

/** Per-IP key for the public rate limiter. */
function clientKey(request: Request, suffix: string): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  return `public:${suffix}:${ip}`;
}

/**
 * Public catalog router. UNAUTHENTICATED by design — this is the marketplace
 * storefront a visitor browses before signing in. It is read-only, rate-limited
 * per IP, and only ever returns the minimal public projection (no PII, no owner,
 * no tenant id to spoof). The business is always resolved server-side from the
 * slug, never from a client-supplied id.
 */
export const publicCatalogRouter = new Elysia({ prefix: '/api/v1/public' })
  .get('/businesses', async ({ request, query }) => {
    const allowed = await container.rateLimiter.consume(
      clientKey(request, 'list'),
      120,
      60,
    );
    if (!allowed) throw new ValidationError('Too many requests, slow down');

    const rawLimit = typeof query?.limit === 'string' ? Number(query.limit) : undefined;
    const limit = Number.isFinite(rawLimit) ? (rawLimit as number) : undefined;
    return listPublicBusinesses({ ...(limit !== undefined ? { limit } : {}) }, container);
  })

  .get('/businesses/:slug', async ({ request, params }) => {
    const allowed = await container.rateLimiter.consume(
      clientKey(request, 'storefront'),
      120,
      60,
    );
    if (!allowed) throw new ValidationError('Too many requests, slow down');

    return getPublicStorefront({ slug: params.slug }, container);
  });
