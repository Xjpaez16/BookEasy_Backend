import { eq } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import { Subscription } from '../../domain/subscription';
import type { SubscriptionRepository } from '../../application/ports';

/** Drizzle-backed SubscriptionRepository. Always scoped by business_id. */
export class DrizzleSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: Database) {}

  async findByBusiness(
    businessId: string,
    tx?: TransactionContext,
  ): Promise<Subscription | null> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.businessId, businessId))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async save(sub: Subscription, tx?: TransactionContext): Promise<void> {
    const s = sub.toJSON();
    await txDb(this.db, tx).insert(schema.subscriptions).values({
      id: s.id,
      businessId: s.businessId,
      plan: s.plan,
      status: s.status,
      priceMinor: s.priceMinor,
      currency: s.currency,
      currentPeriodEnd: s.currentPeriodEnd,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    });
  }

  async update(sub: Subscription, tx?: TransactionContext): Promise<void> {
    const s = sub.toJSON();
    await txDb(this.db, tx)
      .update(schema.subscriptions)
      .set({
        plan: s.plan,
        status: s.status,
        priceMinor: s.priceMinor,
        currency: s.currency,
        currentPeriodEnd: s.currentPeriodEnd,
        updatedAt: s.updatedAt,
      })
      .where(eq(schema.subscriptions.id, s.id));
  }

  private toDomain(
    row: typeof schema.subscriptions.$inferSelect,
  ): Subscription {
    return Subscription.fromPersistence({
      id: row.id,
      businessId: row.businessId,
      plan: row.plan,
      status: row.status,
      priceMinor: row.priceMinor,
      currency: row.currency,
      currentPeriodEnd: row.currentPeriodEnd,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }
}
