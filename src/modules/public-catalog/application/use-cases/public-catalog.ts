import { NotFoundError } from '../../../../shared/domain/errors';

/**
 * PUBLIC projections — the storefront's read model. These are deliberately
 * minimal: only what entices a visitor to book. They expose NO PII (no owner,
 * no emails, no members, no customers, no appointments) and NO internal
 * tenant wiring beyond the public slug. Everything here is safe to serve
 * unauthenticated.
 */

/** A business as it appears in the public marketplace listing. */
export interface PublicBusinessCard {
  slug: string;
  name: string;
  timezone: string;
  /** How many active services it offers — a signal of a browsable storefront. */
  serviceCount: number;
}

/** A single active service in a storefront (no internal ids leaked). */
export interface PublicServiceItem {
  /** Opaque service id — needed later to start a booking, safe to expose. */
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
}

/** A business storefront: public business facts + its active services. */
export interface PublicStorefront {
  slug: string;
  name: string;
  timezone: string;
  services: PublicServiceItem[];
}

/**
 * Read-only port for the public catalog. Implemented by an adapter that
 * resolves everything server-side from the slug — the caller never supplies a
 * business id, so there is no tenant to spoof. Separate from the authenticated
 * repositories (interface segregation): public reads are a distinct capability.
 */
export interface PublicCatalogReader {
  /**
   * Lists businesses that have at least one active, non-deleted service —
   * an empty storefront is not worth showing. Bounded by `limit`.
   */
  listBusinesses(limit: number): Promise<PublicBusinessCard[]>;
  /**
   * Resolves a storefront by slug, with its active services. Returns null when
   * no business owns that slug.
   */
  findStorefrontBySlug(slug: string): Promise<PublicStorefront | null>;
}

export interface PublicCatalogDeps {
  catalog: PublicCatalogReader;
}

/** Marketplace listing. Clamps the limit to a sane public bound (1–100). */
export async function listPublicBusinesses(
  input: { limit?: number },
  deps: PublicCatalogDeps,
): Promise<PublicBusinessCard[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  return deps.catalog.listBusinesses(limit);
}

/** Single storefront by slug. 404 when the slug is unknown. */
export async function getPublicStorefront(
  input: { slug: string },
  deps: PublicCatalogDeps,
): Promise<PublicStorefront> {
  const slug = input.slug.trim().toLowerCase();
  const storefront = await deps.catalog.findStorefrontBySlug(slug);
  if (!storefront) throw new NotFoundError('Business not found');
  return storefront;
}
