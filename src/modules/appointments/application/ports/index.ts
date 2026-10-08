import type { TransactionContext } from '../../../../shared/application/ports';
import type { Appointment, AppointmentStatus } from '../../domain/appointment';
import type { BusinessHour } from '../../domain/business-hours';

export interface AppointmentRepository {
  findById(
    businessId: string,
    id: string,
    tx?: TransactionContext,
  ): Promise<Appointment | null>;

  /**
   * Returns SCHEDULED appointments for a staff member that OVERLAP the given
   * window, using the project's half-open rule
   *   existing.start_at < requested.end_at AND existing.end_at > requested.start_at
   * `excludeId` omits the appointment being rescheduled.
   *
   * When run inside a transaction the implementation takes a row lock on the
   * staff member's conflicting rows (SELECT ... FOR UPDATE) so two concurrent
   * bookings cannot both pass the check (race protection).
   */
  findOverlapsForStaff(
    params: {
      businessId: string;
      staffId: string;
      startAt: Date;
      endAt: Date;
      excludeId?: string;
    },
    tx?: TransactionContext,
  ): Promise<Appointment[]>;

  /** Calendar listing within a UTC window, optionally filtered by staff/status. */
  listInRange(
    params: {
      businessId: string;
      from: Date;
      to: Date;
      staffId?: string;
      status?: AppointmentStatus;
    },
    tx?: TransactionContext,
  ): Promise<Appointment[]>;

  save(appointment: Appointment, tx?: TransactionContext): Promise<void>;
}

export interface BusinessHoursRepository {
  listByBusiness(businessId: string, tx?: TransactionContext): Promise<BusinessHour[]>;
  /** Replaces the full weekly schedule for a business atomically. */
  replaceForBusiness(
    businessId: string,
    hours: BusinessHour[],
    tx?: TransactionContext,
  ): Promise<void>;
}

/** Minimal read side the appointment use cases need from other modules. */
export interface ServiceLookup {
  find(
    businessId: string,
    serviceId: string,
    tx?: TransactionContext,
  ): Promise<{ id: string; durationMinutes: number; priceMinor: number; currency: string; active: boolean; deleted: boolean } | null>;
}

export interface CustomerLookup {
  exists(businessId: string, customerId: string, tx?: TransactionContext): Promise<boolean>;
}

export interface StaffLookup {
  /** True when the membership belongs to the business and is active. */
  isActiveMember(
    businessId: string,
    membershipId: string,
    tx?: TransactionContext,
  ): Promise<boolean>;
}

/**
 * Outbound port the appointment use cases use to schedule a reminder when a
 * booking is created. Implemented by an adapter that delegates to the
 * notifications module, so appointments stay decoupled from how reminders work.
 */
export interface ReminderScheduler {
  scheduleForAppointment(input: {
    businessId: string;
    appointmentId: string;
    appointmentStartAt: Date;
  }): Promise<void>;
}
