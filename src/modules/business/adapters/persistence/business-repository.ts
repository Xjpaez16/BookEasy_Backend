import { eq } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import { Business } from '../../domain/business';
import type { BusinessRepository } from '../../application/ports';

/** Drizzle-backed BusinessRepository. */
export class DrizzleBusinessRepository implements BusinessRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string, tx?: TransactionContext): Promise<Business | null> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.businesses)
      .where(eq(schema.businesses.id, id))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findBySlug(slug: string, tx?: TransactionContext): Promise<Business | null> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.businesses)
      .where(eq(schema.businesses.slug, slug))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async save(business: Business, tx?: TransactionContext): Promise<void> {
    const s = business.snapshot();
    await txDb(this.db, tx)
      .insert(schema.businesses)
      .values({ id: s.id, name: s.name, slug: s.slug, timezone: s.timezone })
      .onConflictDoUpdate({
        target: schema.businesses.id,
        set: { name: s.name, timezone: s.timezone, updatedAt: new Date() },
      });
  }

  private toDomain(row: typeof schema.businesses.$inferSelect): Business {
    return Business.create({
      id: row.id,
      name: row.name,
      slug: row.slug,
      timezone: row.timezone,
    });
  }
}
