import { and, eq, lte, asc } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import { Notification } from '../../domain/notification';
import type { NotificationRepository } from '../../application/ports';

type Row = typeof schema.notifications.$inferSelect;

/** Drizzle-backed NotificationRepository. */
export class DrizzleNotificationRepository implements NotificationRepository {
  constructor(private readonly db: Database) {}

  async save(notification: Notification, tx?: TransactionContext): Promise<void> {
    const s = notification.snapshot();
    await txDb(this.db, tx)
      .insert(schema.notifications)
      .values({
        id: s.id,
        businessId: s.businessId,
        appointmentId: s.appointmentId,
        channel: s.channel,
        status: s.status,
        scheduledAt: s.scheduledAt,
        sentAt: s.sentAt,
        payload: s.payload,
        error: s.error,
      })
      .onConflictDoUpdate({
        target: schema.notifications.id,
        set: {
          status: s.status,
          sentAt: s.sentAt,
          error: s.error,
        },
      });
  }

  async findById(id: string, tx?: TransactionContext): Promise<Notification | null> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, id))
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findDue(
    cutoff: Date,
    limit: number,
    tx?: TransactionContext,
  ): Promise<Notification[]> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.status, 'PENDING'),
          lte(schema.notifications.scheduledAt, cutoff),
        ),
      )
      .orderBy(asc(schema.notifications.scheduledAt))
      .limit(limit);
    return rows.map((r) => this.toDomain(r));
  }

  private toDomain(row: Row): Notification {
    return Notification.rehydrate({
      id: row.id,
      businessId: row.businessId,
      appointmentId: row.appointmentId,
      channel: row.channel,
      status: row.status,
      scheduledAt: row.scheduledAt,
      sentAt: row.sentAt,
      payload: row.payload,
      error: row.error,
    });
  }
}
