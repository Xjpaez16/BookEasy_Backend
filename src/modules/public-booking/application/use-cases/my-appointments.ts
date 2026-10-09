import { TimeInterval } from '../../../appointments/domain/appointment';
import type { Appointment } from '../../../appointments/domain/appointment';
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
import type { PublicBookingReader } from '../ports';
import type { PublicBusinessRef } from '../ports';
import type { PublicAppointmentView } from './book-public-appointment';

export interface MyAppointmentsDeps {
  reader: PublicBookingReader;
  appointments: AppointmentRepository;
  audit: AuditLogRepository;
  ids: IdGenerator;
  clock: Clock;
  uow: UnitOfWork;
}

/**
 * Resolves the business + the caller's OWN customer id in it, or throws.
 * This is the authorization gate for every "my appointments" operation: a
 * user who never booked here has no customer record and therefore no claim on
 * any appointment — they see nothing and can touch nothing.
 */
async function requireOwnCustomer(
  slug: string,
  userId: string,
  deps: MyAppointmentsDeps,
  tx?: Parameters<PublicBookingReader['findBusinessBySlug']>[1],
): Promise<{ businessId: string; businessSlug: string; businessName: string; timezone: string; customerId: string }> {
  const business = await deps.reader.findBusinessBySlug(slug, tx);
  if (!business) throw new NotFoundError('Business not found');
  const customerId = await deps.reader.findCustomerIdForUser(business.id, userId, tx);
  if (!customerId) {
    // No record here → treat as "nothing of yours exists", not "forbidden",
    // so we never leak whether a given appointment id exists.
    throw new NotFoundError('No appointments found');
  }
  return {
    businessId: business.id,
    businessSlug: business.slug,
    businessName: business.name,
    timezone: business.timezone,
    customerId,
  };
}

function toView(
  appt: Appointment,
  businessSlug: string,
  businessName: string,
): PublicAppointmentView {
  const s = appt.snapshot();
  return {
    id: s.id,
    businessSlug,
    businessName,
    serviceId: s.serviceId,
    startAt: s.interval.startAt.toISOString(),
    endAt: s.interval.endAt.toISOString(),
    status: s.status,
    priceMinor: s.priceMinor,
    currency: s.currency,
    notes: s.notes ?? null,
  };
}

/** Lists the caller's own appointments in a business, newest first. */
export async function listMyAppointments(
  input: { userId: string; slug: string },
  deps: MyAppointmentsDeps,
): Promise<PublicAppointmentView[]> {
  const ctx = await requireOwnCustomer(input.slug, input.userId, deps);
  const appts = await deps.reader.listAppointmentsForCustomer(
    ctx.businessId,
    ctx.customerId,
  );
  return appts.map((a) => toView(a, ctx.businessSlug, ctx.businessName));
}

/**
 * Loads one of the caller's appointments or throws 404. The ownership check —
 * appointment.customerId === caller's customerId — is what stops IDOR: a valid
 * appointment id belonging to someone else is indistinguishable from a
 * non-existent one.
 */
async function loadOwned(
  input: { userId: string; slug: string; appointmentId: string },
  deps: MyAppointmentsDeps,
  tx: Parameters<PublicBookingReader['findAppointment']>[2],
): Promise<{ business: PublicBusinessRef; appt: Appointment }> {
  const business = await deps.reader.findBusinessBySlug(input.slug, tx);
  if (!business) throw new NotFoundError('Business not found');
  const customerId = await deps.reader.findCustomerIdForUser(business.id, input.userId, tx);
  if (!customerId) throw new NotFoundError('Appointment not found');

  const appt = await deps.reader.findAppointment(business.id, input.appointmentId, tx);
  if (!appt) throw new NotFoundError('Appointment not found');
  if (appt.snapshot().customerId !== customerId) {
    // Not yours — same error as "not found" so ownership can't be probed.
    throw new NotFoundError('Appointment not found');
  }
  return { business, appt };
}

/** Cancels one of the caller's own appointments. */
export async function cancelMyAppointment(
  input: { userId: string; slug: string; appointmentId: string },
  deps: MyAppointmentsDeps,
): Promise<PublicAppointmentView> {
  return deps.uow.withTransaction(async (tx) => {
    const { business, appt } = await loadOwned(input, deps, tx);
    appt.cancel(); // domain enforces: only a SCHEDULED appointment can cancel
    await deps.appointments.save(appt, tx);
    await deps.audit.record(
      {
        businessId: business.id,
        actorUserId: input.userId,
        action: 'appointment.cancelled_public',
        targetType: 'appointment',
        targetId: appt.id,
      },
      tx,
    );
    return toView(appt, business.slug, business.name);
  });
}

/** Reschedules one of the caller's own appointments to a new start instant. */
export async function rescheduleMyAppointment(
  input: { userId: string; slug: string; appointmentId: string; startAt: string },
  deps: MyAppointmentsDeps,
): Promise<PublicAppointmentView> {
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) {
    throw new ValidationError('Invalid start timestamp');
  }
  if (startAt.getTime() < deps.clock.now().getTime()) {
    throw new ValidationError('Cannot reschedule into the past');
  }

  return deps.uow.withTransaction(async (tx) => {
    const { business, appt } = await loadOwned(input, deps, tx);
    const s = appt.snapshot();
    const duration = s.interval.durationMinutes();
    const interval = TimeInterval.fromDuration(startAt, duration);

    const hours = await deps.reader.listBusinessHours(business.id, tx);
    if (!isWithinBusinessHours(interval, business.timezone, hours)) {
      throw new ValidationError('Requested time is outside business hours');
    }

    // The assigned staff must be free in the new window (exclude this appt).
    const overlaps = await deps.appointments.findOverlapsForStaff(
      {
        businessId: business.id,
        staffId: s.staffId,
        startAt: interval.startAt,
        endAt: interval.endAt,
        excludeId: appt.id,
      },
      tx,
    );
    if (overlaps.length > 0) {
      throw new ConflictError('That time is no longer available');
    }

    appt.reschedule(interval); // domain enforces SCHEDULED-only
    await deps.appointments.save(appt, tx);
    await deps.audit.record(
      {
        businessId: business.id,
        actorUserId: input.userId,
        action: 'appointment.rescheduled_public',
        targetType: 'appointment',
        targetId: appt.id,
      },
      tx,
    );
    return toView(appt, business.slug, business.name);
  });
}
