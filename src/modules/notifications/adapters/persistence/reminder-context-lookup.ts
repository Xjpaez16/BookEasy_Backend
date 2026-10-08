import { and, eq } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import type { NotificationChannel } from '../../domain/notification';
import type {
  ReminderContextLookup,
  ReminderMessage,
} from '../../application/ports';

/**
 * Resolves the reminder recipient + display fields by joining the appointment
 * with its customer, service and business. Returns null when the appointment
 * is no longer SCHEDULED, or the customer lacks a contact for the channel, so
 * a stale/undeliverable reminder is skipped instead of sent.
 */
export class DrizzleReminderContextLookup implements ReminderContextLookup {
  constructor(private readonly db: Database) {}

  async resolve(
    businessId: string,
    appointmentId: string,
    channel: NotificationChannel,
    tx?: TransactionContext,
  ): Promise<ReminderMessage | null> {
    const rows = await txDb(this.db, tx)
      .select({
        status: schema.appointments.status,
        startAt: schema.appointments.startAt,
        businessName: schema.businesses.name,
        serviceName: schema.services.name,
        customerPhone: schema.customers.phone,
        customerEmail: schema.customers.email,
        customerDeletedAt: schema.customers.deletedAt,
      })
      .from(schema.appointments)
      .innerJoin(schema.businesses, eq(schema.appointments.businessId, schema.businesses.id))
      .innerJoin(schema.services, eq(schema.appointments.serviceId, schema.services.id))
      .innerJoin(schema.customers, eq(schema.appointments.customerId, schema.customers.id))
      .where(
        and(
          eq(schema.appointments.businessId, businessId),
          eq(schema.appointments.id, appointmentId),
        ),
      )
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    if (row.status !== 'SCHEDULED') return null; // cancelled/completed/no-show
    if (row.customerDeletedAt) return null;

    const to = channel === 'WHATSAPP' ? row.customerPhone : row.customerEmail;
    if (!to) return null; // no contact for this channel

    return {
      to,
      businessName: row.businessName,
      startAtIso: row.startAt.toISOString(),
      serviceName: row.serviceName,
    };
  }
}
