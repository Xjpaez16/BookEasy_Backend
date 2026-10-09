import { and, eq, desc, gte, lte } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext, IdGenerator } from '../../../../shared/application/ports';
import { Appointment, TimeInterval } from '../../../appointments/domain/appointment';
import type { AppointmentStatus } from '../../../appointments/domain/appointment';
import type { BusinessHour } from '../../../appointments/domain/business-hours';
import type {
  PublicBookingReader,
  PublicBusinessRef,
  PublicServiceRef,
  AssignableStaff,
} from '../../application/ports';

type ApptRow = typeof schema.appointments.$inferSelect;

/**
 * Drizzle-backed reader for the public booking flow. The tenant is always
 * resolved from a slug here; callers never pass a businessId. Appointment rows
 * are mapped to the domain exactly as the owner-facing repository does, so the
 * two share one overlap/interval model.
 */
export class DrizzlePublicBookingReader implements PublicBookingReader {
  constructor(
    private readonly db: Database,
    private readonly ids: IdGenerator,
  ) {}

  async findBusinessBySlug(
    slug: string,
    tx?: TransactionContext,
  ): Promise<PublicBusinessRef | null> {
    const rows = await txDb(this.db, tx)
      .select({
        id: schema.businesses.id,
        slug: schema.businesses.slug,
        name: schema.businesses.name,
        timezone: schema.businesses.timezone,
      })
      .from(schema.businesses)
      .where(eq(schema.businesses.slug, slug))
      .limit(1);
    return rows[0] ?? null;
  }

  async findService(
    businessId: string,
    serviceId: string,
    tx?: TransactionContext,
  ): Promise<PublicServiceRef | null> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.services)
      .where(and(eq(schema.services.businessId, businessId), eq(schema.services.id, serviceId)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      durationMinutes: row.durationMinutes,
      priceMinor: row.priceMinor,
      currency: row.currency,
      active: row.active,
      deleted: row.deletedAt !== null,
    };
  }

  async listBusinessHours(
    businessId: string,
    tx?: TransactionContext,
  ): Promise<BusinessHour[]> {
    const rows = await txDb(this.db, tx)
      .select({
        weekday: schema.businessHours.weekday,
        openMinute: schema.businessHours.openMinute,
        closeMinute: schema.businessHours.closeMinute,
      })
      .from(schema.businessHours)
      .where(eq(schema.businessHours.businessId, businessId));
    return rows.map((r) => ({
      weekday: r.weekday,
      openMinute: r.openMinute,
      closeMinute: r.closeMinute,
    }));
  }

  async listAssignableStaff(
    businessId: string,
    tx?: TransactionContext,
  ): Promise<AssignableStaff[]> {
    const rows = await txDb(this.db, tx)
      .select({ membershipId: schema.businessMembers.id })
      .from(schema.businessMembers)
      .where(
        and(
          eq(schema.businessMembers.businessId, businessId),
          eq(schema.businessMembers.active, true),
        ),
      )
      // Stable order so auto-assignment is deterministic.
      .orderBy(schema.businessMembers.createdAt);
    return rows.map((r) => ({ membershipId: r.membershipId }));
  }

  async resolveCustomerForUser(
    params: { businessId: string; userId: string; fullName: string; email: string | null },
    tx?: TransactionContext,
  ): Promise<string> {
    const runner = txDb(this.db, tx);
    const existing = await runner
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.businessId, params.businessId),
          eq(schema.customers.userId, params.userId),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0].id;

    const id = this.ids.generate();
    await runner
      .insert(schema.customers)
      .values({
        id,
        businessId: params.businessId,
        userId: params.userId,
        fullName: params.fullName,
        email: params.email,
      })
      // Concurrent first-booking: the (business, user) unique index collides;
      // do nothing and re-read below.
      .onConflictDoNothing({
        target: [schema.customers.businessId, schema.customers.userId],
      });

    const row = await runner
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.businessId, params.businessId),
          eq(schema.customers.userId, params.userId),
        ),
      )
      .limit(1);
    return row[0]?.id ?? id;
  }

  async findCustomerIdForUser(
    businessId: string,
    userId: string,
    tx?: TransactionContext,
  ): Promise<string | null> {
    const rows = await txDb(this.db, tx)
      .select({ id: schema.customers.id })
      .from(schema.customers)
      .where(
        and(
          eq(schema.customers.businessId, businessId),
          eq(schema.customers.userId, userId),
        ),
      )
      .limit(1);
    return rows[0]?.id ?? null;
  }

  async listAppointmentsInRange(
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

  async listAppointmentsForCustomer(
    businessId: string,
    customerId: string,
    tx?: TransactionContext,
  ): Promise<Appointment[]> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.businessId, businessId),
          eq(schema.appointments.customerId, customerId),
        ),
      )
      .orderBy(desc(schema.appointments.startAt));
    return rows.map((r) => this.toDomain(r));
  }

  async findAppointment(
    businessId: string,
    appointmentId: string,
    tx?: TransactionContext,
  ): Promise<Appointment | null> {
    const rows = await txDb(this.db, tx)
      .select()
      .from(schema.appointments)
      .where(
        and(
          eq(schema.appointments.businessId, businessId),
          eq(schema.appointments.id, appointmentId),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? this.toDomain(row) : null;
  }

  private toDomain(row: ApptRow): Appointment {
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
