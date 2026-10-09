import { Appointment, TimeInterval } from '../../../appointments/domain/appointment';
import { isWithinBusinessHours } from '../../../appointments/domain/business-hours';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type {
  Clock,
  IdGenerator,
  UnitOfWork,
} from '../../../../shared/application/ports';
import type { AppointmentRepository } from '../../../appointments/application/ports';
import type { AuditLogRepository } from '../../../business/application/ports';
import type { ReminderScheduler } from '../../../appointments/application/ports';
import type { PublicBookingReader } from '../ports';

export interface BookPublicInput {
  /** The authenticated marketplace user (identity only — NOT a member). */
  userId: string;
  /** Their display name + email from the user record (seed a new customer). */
  userFullName: string;
  userEmail: string | null;
  /** Public business slug — the ONLY tenant selector a client provides. */
  slug: string;
  serviceId: string;
  /** ISO-8601 start instant. */
  startAt: string;
  notes?: string | null;
}

export interface PublicAppointmentView {
  id: string;
  businessSlug: string;
  businessName: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  status: string;
  priceMinor: number;
  currency: string;
  notes: string | null;
}

export interface BookPublicDeps {
  reader: PublicBookingReader;
  appointments: AppointmentRepository;
  audit: AuditLogRepository;
  ids: IdGenerator;
  clock: Clock;
  uow: UnitOfWork;
  reminders?: ReminderScheduler;
}

/**
 * Books an appointment for a marketplace VISITOR (an authenticated user who is
 * NOT a member of the business). The tenant is resolved from the slug; the
 * staff member is auto-assigned server-side (the client never sees or picks
 * one); the customer is the user's own record in this business, created on
 * first booking. Same safety invariants as the owner-facing booking:
 *  - service active & belongs to the business;
 *  - interval valid and inside business hours (tz-aware);
 *  - no overlapping SCHEDULED appointment for the assigned staff.
 * Overlap check + insert run in one transaction with row locking.
 */
export async function bookPublicAppointment(
  input: BookPublicInput,
  deps: BookPublicDeps,
): Promise<PublicAppointmentView> {
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) {
    throw new ValidationError('Invalid start timestamp');
  }
  if (startAt.getTime() < deps.clock.now().getTime()) {
    throw new ValidationError('Cannot book a time in the past');
  }

  const result = await deps.uow.withTransaction(async (tx) => {
    const business = await deps.reader.findBusinessBySlug(input.slug, tx);
    if (!business) throw new NotFoundError('Business not found');

    const service = await deps.reader.findService(business.id, input.serviceId, tx);
    if (!service || service.deleted) throw new NotFoundError('Service not found');
    if (!service.active) throw new ValidationError('Service is not active');

    const interval = TimeInterval.fromDuration(startAt, service.durationMinutes);

    const hours = await deps.reader.listBusinessHours(business.id, tx);
    if (!isWithinBusinessHours(interval, business.timezone, hours)) {
      throw new ValidationError('Requested time is outside business hours');
    }

    const staff = await deps.reader.listAssignableStaff(business.id, tx);
    if (staff.length === 0) {
      throw new ValidationError('This business is not accepting bookings yet');
    }

    // Auto-assign: first staff member with no overlapping SCHEDULED appointment.
    let assignedStaffId: string | null = null;
    for (const s of staff) {
      const overlaps = await deps.appointments.findOverlapsForStaff(
        {
          businessId: business.id,
          staffId: s.membershipId,
          startAt: interval.startAt,
          endAt: interval.endAt,
        },
        tx,
      );
      if (overlaps.length === 0) {
        assignedStaffId = s.membershipId;
        break;
      }
    }
    if (!assignedStaffId) {
      throw new ConflictError('No staff available at that time');
    }

    // Customer-from-user: the user's own record in THIS business (per-tenant).
    const customerId = await deps.reader.resolveCustomerForUser(
      {
        businessId: business.id,
        userId: input.userId,
        fullName: input.userFullName,
        email: input.userEmail,
      },
      tx,
    );

    const appointment = Appointment.create({
      id: deps.ids.generate(),
      businessId: business.id,
      customerId,
      serviceId: service.id,
      staffId: assignedStaffId,
      interval,
      status: 'SCHEDULED',
      priceMinor: service.priceMinor,
      currency: service.currency,
      notes: input.notes ?? null,
    });
    await deps.appointments.save(appointment, tx);

    await deps.audit.record(
      {
        businessId: business.id,
        actorUserId: input.userId,
        action: 'appointment.booked_public',
        targetType: 'appointment',
        targetId: appointment.id,
      },
      tx,
    );

    const s = appointment.snapshot();
    return {
      id: s.id,
      businessSlug: business.slug,
      businessName: business.name,
      serviceId: s.serviceId,
      startAt: s.interval.startAt.toISOString(),
      endAt: s.interval.endAt.toISOString(),
      status: s.status,
      priceMinor: s.priceMinor,
      currency: s.currency,
      notes: s.notes ?? null,
    } satisfies PublicAppointmentView;
  });

  if (deps.reminders) {
    try {
      await deps.reminders.scheduleForAppointment({
        businessId: (await deps.reader.findBusinessBySlug(input.slug))?.id ?? '',
        appointmentId: result.id,
        appointmentStartAt: new Date(result.startAt),
      });
    } catch {
      // Non-critical: the booking already committed.
    }
  }

  return result;
}
