import type { TransactionContext } from '../../../../shared/application/ports';
import type { Appointment, AppointmentStatus } from '../../../appointments/domain/appointment';
import type { BusinessHour } from '../../../appointments/domain/business-hours';

/**
 * Minimal public view of a business, resolved by slug. No internal ids are
 * exposed to the client; `id` is used only server-side within this module.
 */
export interface PublicBusinessRef {
  id: string;
  slug: string;
  name: string;
  timezone: string;
}

/** A bookable service's scheduling-relevant facts. */
export interface PublicServiceRef {
  id: string;
  durationMinutes: number;
  priceMinor: number;
  currency: string;
  active: boolean;
  deleted: boolean;
}

/** An active staff membership id the booking engine can assign to. */
export interface AssignableStaff {
  membershipId: string;
}

/**
 * Read/resolve side the public booking use cases need. Everything is resolved
 * SERVER-SIDE from the slug + the authenticated user id — the client never
 * supplies a businessId or a staffId. This is the tenant boundary: a public
 * caller can only reach what these methods expose for the slug they named.
 */
export interface PublicBookingReader {
  /** Resolves a business by its public slug. Null when unknown. */
  findBusinessBySlug(
    slug: string,
    tx?: TransactionContext,
  ): Promise<PublicBusinessRef | null>;

  /** The service by id, scoped to the business. Null when it does not belong. */
  findService(
    businessId: string,
    serviceId: string,
    tx?: TransactionContext,
  ): Promise<PublicServiceRef | null>;

  /** Weekly opening hours for availability computation. */
  listBusinessHours(businessId: string, tx?: TransactionContext): Promise<BusinessHour[]>;

  /** Active staff memberships the engine may auto-assign, stable order. */
  listAssignableStaff(
    businessId: string,
    tx?: TransactionContext,
  ): Promise<AssignableStaff[]>;

  /**
   * Finds the customer record that represents this user in this business,
   * creating it on first booking (customer-from-user). Scoped by (business,
   * user) — returns the customer id. Contact details seed a new record only.
   */
  resolveCustomerForUser(
    params: {
      businessId: string;
      userId: string;
      fullName: string;
      email: string | null;
    },
    tx?: TransactionContext,
  ): Promise<string>;

  /**
   * The customer id for this user in this business, WITHOUT creating one.
   * Null when the user has never booked here. Used by "my appointments".
   */
  findCustomerIdForUser(
    businessId: string,
    userId: string,
    tx?: TransactionContext,
  ): Promise<string | null>;

  /**
   * Appointments for a business within a UTC window, optionally one staff.
   * Used to subtract busy slots when computing availability (all staff).
   */
  listAppointmentsInRange(
    params: {
      businessId: string;
      from: Date;
      to: Date;
      staffId?: string;
      status?: AppointmentStatus;
    },
    tx?: TransactionContext,
  ): Promise<Appointment[]>;

  /** A user's own appointments in a business, newest first. */
  listAppointmentsForCustomer(
    businessId: string,
    customerId: string,
    tx?: TransactionContext,
  ): Promise<Appointment[]>;

  /**
   * Fetch an appointment by id scoped to a business. Null when not found.
   * The use case still checks the appointment's customer matches the caller.
   */
  findAppointment(
    businessId: string,
    appointmentId: string,
    tx?: TransactionContext,
  ): Promise<Appointment | null>;
}
