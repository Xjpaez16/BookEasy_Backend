import { and, eq, isNull, desc } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import { Service } from '../../domain/service';
import type { ServiceRepository } from '../../application/ports';

type Row = typeof schema.services.$inferSelect;

/** Drizzle-backed ServiceRepository. Every query is scoped by business_id. */
export class DrizzleServiceRepository implements ServiceRepository {
  constructor(private readonly db: Database) {}

  async findById(
    businessId: string,
    id: string,
    tx?: TransactionContext,
  ): Promise<Service | null> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.services)
      .where(
        and(eq(schema.services.businessId, businessId), eq(schema.services.id, id)),
      )
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async listByBusiness(
    businessId: string,
    opts?: { includeDeleted?: boolean; onlyActive?: boolean },
    tx?: TransactionContext,
  ): Promise<Service[]> {
    const conditions = [eq(schema.services.businessId, businessId)];
    if (!opts?.includeDeleted) conditions.push(isNull(schema.services.deletedAt));
    if (opts?.onlyActive) conditions.push(eq(schema.services.active, true));

    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.services)
      .where(and(...conditions))
      .orderBy(desc(schema.services.createdAt));
    return rows.map((r) => this.toDomain(r));
  }

  async save(service: Service, tx?: TransactionContext): Promise<void> {
    const s = service.snapshot();
    await txDb(this.db, tx)
      .insert(schema.services)
      .values({
        id: s.id,
        businessId: s.businessId,
        name: s.name,
        description: s.description,
        durationMinutes: s.durationMinutes,
        priceMinor: s.priceMinor,
        currency: s.currency,
        active: s.active,
        deletedAt: s.deletedAt,
      })
      .onConflictDoUpdate({
        target: schema.services.id,
        set: {
          name: s.name,
          description: s.description,
          durationMinutes: s.durationMinutes,
          priceMinor: s.priceMinor,
          currency: s.currency,
          active: s.active,
          deletedAt: s.deletedAt,
          updatedAt: new Date(),
        },
      });
  }

  private toDomain(row: Row): Service {
    return Service.create({
      id: row.id,
      businessId: row.businessId,
      name: row.name,
      description: row.description,
      durationMinutes: row.durationMinutes,
      priceMinor: row.priceMinor,
      currency: row.currency,
      active: row.active,
      deletedAt: row.deletedAt,
    });
  }
}
