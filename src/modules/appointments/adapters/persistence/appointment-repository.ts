import { and, eq, lt, gt, gte, lte, ne } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import { Appointment, TimeInterval } from '../../domain/appointment';
import type { AppointmentRepository } from '../../application/ports';
import type { AppointmentStatus } from '../../domain/appointment';

type Row = typeof schema.appointments.$inferSelect;

/** Drizzle-backed AppointmentRepository. Every query is scoped by business_id. */
export class DrizzleAppointmentRepository implements AppointmentRepository {
  constructor(private readonly db: Database) {}

  async findById(
    businessId: string,
    id: string,
    tx?: TransactionContext,
  ): Promise<Appointment | null> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.businessId, businessId),
          eq(schema.appointments.id, id),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  async findOverlapsForStaff(
    params: {
      businessId: string;
      staffId: string;
      startAt: Date;
      endAt: Date;
      excludeId?: string;
    },
    tx?: TransactionContext,
  ): Promise<Appointment[]> {
    const conditions = [
      eq(schema.appointments.businessId, params.businessId),
      eq(schema.appointments.staffId, params.staffId),
      eq(schema.appointments.status, 'SCHEDULED'),
      // Overlap rule (half-open): start < requested.end AND end > requested.start
      lt(schema.appointments.startAt, params.endAt),
      gt(schema.appointments.endAt, params.startAt),
    ];
    if (params.excludeId) {
      conditions.push(ne(schema.appointments.id, params.excludeId));
    }

    const runner = txDb(this.db, tx);
    const query = runner
      .select()
      .from(schema.appointments)
      .where(and(...conditions));

    // Lock the conflicting rows only when inside a transaction, so two
    // concurrent bookings for the same staff serialise on the overlap check.
    const rows = tx ? await query.for('update') : await query;
    return rows.map((r) => this.toDomain(r));
  }

  async listInRange(
    params: {
      businessId: string;
      from: Date;
      to: Date;
      staffId?: string;
      status?: AppointmentStatus;
    },
    tx?: TransactionContext,
  ): Promise<Appointment[]> {
    const conditions = [
      eq(schema.appointments.businessId, params.businessId),
      gte(schema.appointments.startAt, params.from),
      lte(schema.appointments.startAt, params.to),
    ];
    if (params.staffId) conditions.push(eq(schema.appointments.staffId, params.staffId));
    if (params.status) conditions.push(eq(schema.appointments.status, params.status));

    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.appointments)
      .where(and(...conditions));
    return rows.map((r) => this.toDomain(r));
  }

  async save(appointment: Appointment, tx?: TransactionContext): Promise<void> {
    const s = appointment.snapshot();
    await txDb(this.db, tx)
      .insert(schema.appointments)
      .values({
        id: s.id,
        businessId: s.businessId,
        customerId: s.customerId,
        serviceId: s.serviceId,
        staffId: s.staffId,
        startAt: s.interval.startAt,
        endAt: s.interval.endAt,
        status: s.status,
        priceMinor: s.priceMinor,
        currency: s.currency,
        notes: s.notes ?? null,
      })
      .onConflictDoUpdate({
        target: schema.appointments.id,
        set: {
          startAt: s.interval.startAt,
          endAt: s.interval.endAt,
          status: s.status,
          notes: s.notes ?? null,
          updatedAt: new Date(),
        },
      });
  }

  private toDomain(row: Row): Appointment {
    return Appointment.create({
      id: row.id,
      businessId: row.businessId,
      customerId: row.customerId,
      serviceId: row.serviceId,
      staffId: row.staffId,
      interval: TimeInterval.create(row.startAt, row.endAt),
      status: row.status,
      priceMinor: row.priceMinor,
      currency: row.currency,
      notes: row.notes,
    });
  }
}
