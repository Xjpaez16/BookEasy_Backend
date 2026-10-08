import { Appointment, TimeInterval } from '../../domain/appointment';
import { isWithinBusinessHours } from '../../domain/business-hours';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type { Clock, IdGenerator, UnitOfWork } from '../../../../shared/application/ports';
import type { AuditLogRepository, BusinessRepository } from '../../../business/application/ports';
import type {
  AppointmentRepository,
  BusinessHoursRepository,
  ServiceLookup,
  CustomerLookup,
  StaffLookup,
  ReminderScheduler,
} from '../ports';

export interface AppointmentDeps {
  appointments: AppointmentRepository;
  hours: BusinessHoursRepository;
  services: ServiceLookup;
  customers: CustomerLookup;
  staff: StaffLookup;
  businesses: BusinessRepository;
  audit: AuditLogRepository;
  ids: IdGenerator;
  clock: Clock;
  uow: UnitOfWork;
  /** Optional: schedule a reminder on booking. Absent in unit tests. */
  reminders?: ReminderScheduler;
}

export interface CreateAppointmentInput {
  actorUserId: string;
  businessId: string;
  customerId: string;
  serviceId: string;
  staffId: string;
  /** ISO-8601 UTC start instant. */
  startAt: string;
  notes?: string | null;
}

export interface AppointmentView {
  id: string;
  customerId: string;
  serviceId: string;
  staffId: string;
  startAt: string;
  endAt: string;
  status: string;
  priceMinor: number;
  currency: string;
  notes: string | null;
}

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

/**
 * Books an appointment. Validates (per appointment-domain skill):
 *  - customer, service and staff all belong to the business;
 *  - service is active, staff membership is active;
 *  - the interval is valid and inside business hours (tz-aware);
 *  - no SCHEDULED appointment overlaps for the same staff member.
 *
 * Runs inside a transaction so the overlap check and insert are atomic; the
 * repository locks the staff member's conflicting rows (FOR UPDATE) to prevent
 * two concurrent bookings from racing past the check.
 */
export async function createAppointment(
  input: CreateAppointmentInput,
  deps: AppointmentDeps,
): Promise<AppointmentView> {
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) {
    throw new ValidationError('Invalid start timestamp');
  }

  const created = await deps.uow.withTransaction(async (tx) => {
    const business = await deps.businesses.findById(input.businessId, tx);
    if (!business) throw new NotFoundError('Business not found');

    const service = await deps.services.find(input.businessId, input.serviceId, tx);
    if (!service || service.deleted) throw new NotFoundError('Service not found');
    if (!service.active) throw new ValidationError('Service is not active');

    const customerOk = await deps.customers.exists(input.businessId, input.customerId, tx);
    if (!customerOk) throw new NotFoundError('Customer not found');

    const staffOk = await deps.staff.isActiveMember(input.businessId, input.staffId, tx);
    if (!staffOk) throw new ValidationError('Staff member is not active in this business');

    const interval = TimeInterval.fromDuration(startAt, service.durationMinutes);

    const hours = await deps.hours.listByBusiness(input.businessId, tx);
    if (!isWithinBusinessHours(interval, business.timezone, hours)) {
      throw new ValidationError('Requested time is outside business hours');
    }

    const overlaps = await deps.appointments.findOverlapsForStaff(
      {
        businessId: input.businessId,
        staffId: input.staffId,
        startAt: interval.startAt,
        endAt: interval.endAt,
      },
      tx,
    );
    if (overlaps.length > 0) {
      throw new ConflictError('The staff member already has an appointment in that window');
    }

    const appointment = Appointment.create({
      id: deps.ids.generate(),
      businessId: input.businessId,
      customerId: input.customerId,
      serviceId: input.serviceId,
      staffId: input.staffId,
      interval,
      status: 'SCHEDULED',
      priceMinor: service.priceMinor,
      currency: service.currency,
      notes: input.notes ?? null,
    });
    await deps.appointments.save(appointment, tx);

    await deps.audit.record(
      {
        businessId: input.businessId,
        actorUserId: input.actorUserId,
        action: 'appointment.created',
        targetType: 'appointment',
        targetId: appointment.id,
      },
      tx,
    );

    return toView(appointment);
  });

  // Schedule a reminder AFTER the booking is committed, so a rolled-back
  // transaction never leaves a dangling reminder. Best-effort: a scheduling
  // failure must not fail the (already successful) booking.
  if (deps.reminders) {
    try {
      await deps.reminders.scheduleForAppointment({
        businessId: input.businessId,
        appointmentId: created.id,
        appointmentStartAt: new Date(created.startAt),
      });
    } catch {
      // Swallow — the appointment exists; reminder scheduling is non-critical.
    }
  }

  return created;
}
