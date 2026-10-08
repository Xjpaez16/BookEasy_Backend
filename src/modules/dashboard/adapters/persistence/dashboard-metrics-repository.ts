import { and, eq, gte, lt, count, isNull, asc } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import type {
  DashboardMetricsRepository,
  StatusBreakdown,
  AppointmentSummaryRow,
} from '../../application/ports';

/** Drizzle-backed, read-only dashboard aggregations. All tenant-scoped. */
export class DrizzleDashboardMetricsRepository implements DashboardMetricsRepository {
  constructor(private readonly db: Database) {}

  async statusBreakdown(
    businessId: string,
    from: Date,
    to: Date,
    tx?: TransactionContext,
  ): Promise<StatusBreakdown> {
    const rows = await txDb(this.db, tx)
      .select({ status: schema.appointments.status, value: count() })
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.businessId, businessId),
          gte(schema.appointments.startAt, from),
          lt(schema.appointments.startAt, to),
        ),
      )
      .groupBy(schema.appointments.status);

    const breakdown: StatusBreakdown = {
      SCHEDULED: 0,
      COMPLETED: 0,
      CANCELLED: 0,
      NO_SHOW: 0,
    };
    for (const r of rows) breakdown[r.status] = Number(r.value);
    return breakdown;
  }

  async upcoming(
    businessId: string,
    now: Date,
    limit: number,
    tx?: TransactionContext,
  ): Promise<AppointmentSummaryRow[]> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.businessId, businessId),
          eq(schema.appointments.status, 'SCHEDULED'),
          gte(schema.appointments.startAt, now),
        ),
      )
      .orderBy(asc(schema.appointments.startAt))
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      serviceId: r.serviceId,
      staffId: r.staffId,
      startAt: r.startAt,
      endAt: r.endAt,
      status: r.status,
    }));
  }

  async activeCustomerCount(
    businessId: string,
    tx?: TransactionContext,
  ): Promise<number> {
    const rows = await txDb(this.db, tx)
      .select({ value: count() })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.businessId, businessId),
          isNull(schema.customers.deletedAt),
        ),
      );
    return Number(rows[0]?.value ?? 0);
  }

  async activeServiceCount(
    businessId: string,
    tx?: TransactionContext,
  ): Promise<number> {
    const rows = await txDb(this.db, tx)
      .select({ value: count() })
      .from(schema.services)
      .where(
        and(
          eq(schema.services.businessId, businessId),
          eq(schema.services.active, true),
          isNull(schema.services.deletedAt),
        ),
      );
    return Number(rows[0]?.value ?? 0);
  }
}
