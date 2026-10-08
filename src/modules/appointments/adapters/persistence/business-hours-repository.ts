import { eq } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb, type DrizzleTxContext } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import type { BusinessHour } from '../../domain/business-hours';
import type { BusinessHoursRepository } from '../../application/ports';

/** Drizzle-backed BusinessHoursRepository. */
export class DrizzleBusinessHoursRepository implements BusinessHoursRepository {
  constructor(private readonly db: Database) {}

  async listByBusiness(
    businessId: string,
    tx?: TransactionContext,
  ): Promise<BusinessHour[]> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.businessHours)
      .where(eq(schema.businessHours.businessId, businessId));
    return rows.map((r) => ({
      weekday: r.weekday,
      openMinute: r.openMinute,
      closeMinute: r.closeMinute,
    }));
  }

  async replaceForBusiness(
    businessId: string,
    hours: BusinessHour[],
    tx?: TransactionContext,
  ): Promise<void> {
    const run = async (ctx: TransactionContext): Promise<void> => {
      const runner = txDb(this.db, ctx);
      await runner
        .delete(schema.businessHours)
        .where(eq(schema.businessHours.businessId, businessId));
      if (hours.length > 0) {
        await runner.insert(schema.businessHours).values(
          hours.map((h) => ({
            businessId,
            weekday: h.weekday,
            openMinute: h.openMinute,
            closeMinute: h.closeMinute,
          })),
        );
      }
    };

    if (tx) {
      await run(tx);
    } else {
      await this.db.transaction(async (t) => {
        const ctx: DrizzleTxContext = {
          _brand: 'TransactionContext',
          db: t as unknown as Database,
        };
        await run(ctx);
      });
    }
  }
}
