import { and, eq, isNull, sql, desc } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import type {
  PublicCatalogReader,
  PublicBusinessCard,
  PublicStorefront,
  PublicServiceItem,
} from '../../application/use-cases/public-catalog';

/**
 * Drizzle-backed public catalog reader. Every query selects ONLY the public
 * projection columns — it never reads owner ids, members, customers or any
 * PII column, so there is no path for sensitive data to leak into the public
 * API even by accident. Active + non-deleted services only.
 */
export class DrizzlePublicCatalogReader implements PublicCatalogReader {
  constructor(private readonly db: Database) {}

  async listBusinesses(limit: number): Promise<PublicBusinessCard[]> {
    // Businesses that have at least one active, non-deleted service. The count
    // is computed by an inner join + group by, so empty storefronts drop out.
    const rows = await this.db
      .select({
        slug: schema.businesses.slug,
        name: schema.businesses.name,
        timezone: schema.businesses.timezone,
        serviceCount: sql<number>`count(${schema.services.id})`.mapWith(Number),
      })
      .from(schema.businesses)
      .innerJoin(
        schema.services,
        and(
          eq(schema.services.businessId, schema.businesses.id),
          eq(schema.services.active, true),
          isNull(schema.services.deletedAt),
        ),
      )
      .groupBy(
        schema.businesses.id,
        schema.businesses.slug,
        schema.businesses.name,
        schema.businesses.timezone,
      )
      .orderBy(desc(sql`count(${schema.services.id})`))
      .limit(limit);

    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      timezone: r.timezone,
      serviceCount: r.serviceCount,
    }));
  }

  async findStorefrontBySlug(slug: string): Promise<PublicStorefront | null> {
    const bizRows = await this.db
      .select({
        id: schema.businesses.id,
        slug: schema.businesses.slug,
        name: schema.businesses.name,
        timezone: schema.businesses.timezone,
      })
      .from(schema.businesses)
      .where(eq(schema.businesses.slug, slug))
      .limit(1);

    const biz = bizRows[0];
    if (!biz) return null;

    const serviceRows = await this.db
      .select({
        id: schema.services.id,
        name: schema.services.name,
        description: schema.services.description,
        durationMinutes: schema.services.durationMinutes,
        priceMinor: schema.services.priceMinor,
        currency: schema.services.currency,
      })
      .from(schema.services)
      .where(
        and(
          eq(schema.services.businessId, biz.id),
          eq(schema.services.active, true),
          isNull(schema.services.deletedAt),
        ),
      )
      .orderBy(desc(schema.services.createdAt));

    const services: PublicServiceItem[] = serviceRows.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      priceMinor: s.priceMinor,
      currency: s.currency,
    }));

    // Note: biz.id stays server-side; it is NOT part of the public projection.
    return {
      slug: biz.slug,
      name: biz.name,
      timezone: biz.timezone,
      services,
    };
  }
}
