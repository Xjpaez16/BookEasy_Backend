import { Appointment, TimeInterval } from '../../domain/appointment';
import { isWithinBusinessHours } from '../../domain/business-hours';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type { AppointmentDeps, AppointmentView } from './create-appointment';
import type { AppointmentRepository } from '../ports';

// Re-export the view shape for the module's HTTP layer.
export type { AppointmentView } from './create-appointment';

function toView(appt: Appointment): AppointmentView {
  const s = appt.snapshot();
  return {
    id: s.id,
    customerId: s.customerId,
    serviceId: s.serviceId,
    staffId: s.staffId,
    startAt: s.interval.startAt.toISOString(),
    endAt: s.interval.endAt.toISOString(),
    status: s.status,
    priceMinor: s.priceMinor,
    currency: s.currency,
    notes: s.notes ?? null,
  };
}

export interface RescheduleInput {
  actorUserId: string;
  businessId: string;
  appointmentId: string;
  startAt: string;
}

/**
 * Moves a SCHEDULED appointment to a new start. Keeps the same duration/staff;
 * re-validates business hours and overlap (excluding itself) under a tx lock.
 */
export async function rescheduleAppointment(
  input: RescheduleInput,
  deps: AppointmentDeps,
): Promise<AppointmentView> {
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) {
    throw new ValidationError('Invalid start timestamp');
  }

  return deps.uow.withTransaction(async (tx) => {
    const appointment = await deps.appointments.findById(
      input.businessId,
      input.appointmentId,
      tx,
    );
    if (!appointment) throw new NotFoundError('Appointment not found');

    const business = await deps.businesses.findById(input.businessId, tx);
    if (!business) throw new NotFoundError('Business not found');

    const duration = appointment.interval.durationMinutes();
    const interval = TimeInterval.fromDuration(startAt, duration);

    const hours = await deps.hours.listByBusiness(input.businessId, tx);
    if (!isWithinBusinessHours(interval, business.timezone, hours)) {
      throw new ValidationError('Requested time is outside business hours');
    }

    const overlaps = await deps.appointments.findOverlapsForStaff(
      {
        businessId: input.businessId,
        staffId: appointment.staffId,
        startAt: interval.startAt,
        endAt: interval.endAt,
        excludeId: appointment.id,
      },
      tx,
    );
    if (overlaps.length > 0) {
      throw new ConflictError('The staff member already has an appointment in that window');
    }

    appointment.reschedule(interval);
    await deps.appointments.save(appointment, tx);

    await deps.audit.record(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: 'appointment.rescheduled',
        targetType: 'appointment',
        targetId: appointment.id,
      },
      tx,
    );

    return toView(appointment);
  });
}

export type TransitionKind = 'cancel' | 'complete' | 'no_show';

export interface TransitionInput {
  actorUserId: string;
  businessId: string;
  appointmentId: string;
}

/**
 * Applies a lifecycle transition to a SCHEDULED appointment. The domain
 * aggregate rejects transitions from a terminal status.
 */
export async function transitionAppointment(
  kind: TransitionKind,
  input: TransitionInput,
  deps: AppointmentDeps,
): Promise<AppointmentView> {
  const appointment = await deps.appointments.findById(
    input.businessId,
    input.appointmentId,
  );
  if (!appointment) throw new NotFoundError('Appointment not found');

  if (kind === 'cancel') appointment.cancel();
  else if (kind === 'complete') appointment.complete();
  else appointment.markNoShow();

  await deps.appointments.save(appointment);
  await deps.audit.record({
    businessId: input.businessId,
    actorUserId: input.actorUserId,
    action: `appointment.${kind}`,
    targetType: 'appointment',
    targetId: appointment.id,
  });

  return toView(appointment);
}

export interface ListAppointmentsInput {
  businessId: string;
  from: string;
  to: string;
  staffId?: string;
}

export async function listAppointments(
  input: ListAppointmentsInput,
  deps: { appointments: AppointmentRepository },
): Promise<AppointmentView[]> {
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ValidationError('Invalid date range');
  }
  if (to.getTime() <= from.getTime()) {
    throw new ValidationError('Range end must be after start');
  }
  const rows = await deps.appointments.listInRange({
    businessId: input.businessId,
    from,
    to,
    ...(input.staffId ? { staffId: input.staffId } : {}),
  });
  return rows.map(toView);
}
