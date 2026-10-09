import { describe, it, expect } from 'bun:test';
import {
  listPublicBusinesses,
  getPublicStorefront,
  type PublicCatalogReader,
  type PublicBusinessCard,
  type PublicStorefront,
} from '../../src/modules/public-catalog/application/use-cases/public-catalog';
import { NotFoundError } from '../../src/shared/domain/errors';

/** In-memory reader that records the limit it was asked for. */
class FakeReader implements PublicCatalogReader {
  lastLimit = -1;
  constructor(
    private readonly businesses: PublicBusinessCard[],
    private readonly storefronts: Record<string, PublicStorefront>,
  ) {}
  async listBusinesses(limit: number): Promise<PublicBusinessCard[]> {
    this.lastLimit = limit;
    return this.businesses.slice(0, limit);
  }
  async findStorefrontBySlug(slug: string): Promise<PublicStorefront | null> {
    return this.storefronts[slug] ?? null;
  }
}

const card = (slug: string, serviceCount: number): PublicBusinessCard => ({
  slug,
  name: slug,
  timezone: 'America/Bogota',
  serviceCount,
});

describe('listPublicBusinesses', () => {
  it('defaults the limit to 50 when none is given', async () => {
    const reader = new FakeReader([card('a', 2)], {});
    await listPublicBusinesses({}, { catalog: reader });
    expect(reader.lastLimit).toBe(50);
  });

  it('clamps a huge limit down to 100', async () => {
    const reader = new FakeReader([], {});
    await listPublicBusinesses({ limit: 10000 }, { catalog: reader });
    expect(reader.lastLimit).toBe(100);
  });

  it('clamps a zero/negative limit up to 1', async () => {
    const reader = new FakeReader([], {});
    await listPublicBusinesses({ limit: 0 }, { catalog: reader });
    expect(reader.lastLimit).toBe(1);
  });

  it('returns the business cards from the reader', async () => {
    const reader = new FakeReader([card('salon', 3)], {});
    const out = await listPublicBusinesses({ limit: 10 }, { catalog: reader });
    expect(out).toEqual([card('salon', 3)]);
  });
});

describe('getPublicStorefront', () => {
  const storefront: PublicStorefront = {
    slug: 'cat-salon',
    name: 'Cat Salon',
    timezone: 'America/Bogota',
    services: [
      {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Corte',
        description: null,
        durationMinutes: 45,
        priceMinor: 2500,
        currency: 'USD',
      },
    ],
  };

  it('returns the storefront for a known slug', async () => {
    const reader = new FakeReader([], { 'cat-salon': storefront });
    const out = await getPublicStorefront({ slug: 'cat-salon' }, { catalog: reader });
    expect(out).toEqual(storefront);
  });

  it('normalizes the slug (trim + lowercase) before lookup', async () => {
    const reader = new FakeReader([], { 'cat-salon': storefront });
    const out = await getPublicStorefront(
      { slug: '  CAT-SALON  ' },
      { catalog: reader },
    );
    expect(out.slug).toBe('cat-salon');
  });

  it('throws NotFound for an unknown slug', async () => {
    const reader = new FakeReader([], {});
    await expect(
      getPublicStorefront({ slug: 'ghost' }, { catalog: reader }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('never exposes a businessId field in the projection', async () => {
    const reader = new FakeReader([], { 'cat-salon': storefront });
    const out = await getPublicStorefront({ slug: 'cat-salon' }, { catalog: reader });
    expect(Object.keys(out)).toEqual(['slug', 'name', 'timezone', 'services']);
    expect('businessId' in out).toBe(false);
  });
});
