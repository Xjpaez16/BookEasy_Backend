import { ValidationError } from '../../../shared/domain/errors';

export type AppointmentStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

/**
 * A half-open UTC time interval [startAt, endAt). Pure domain value object.
 * No framework / infrastructure imports.
 */
export class TimeInterval {
  private constructor(
    readonly startAt: Date,
    readonly endAt: Date,
  ) {}

  static create(startAt: Date, endAt: Date): TimeInterval {
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new ValidationError('Invalid appointment timestamps');
    }
    if (endAt.getTime() <= startAt.getTime()) {
      throw new ValidationError('Appointment end must be after start');
    }
    return new TimeInterval(startAt, endAt);
  }

  /** Builds an interval from a start instant and a positive duration. */
  static fromDuration(startAt: Date, durationMinutes: number): TimeInterval {
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      throw new ValidationError('Service duration must be a positive integer');
    }
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    return TimeInterval.create(startAt, endAt);
  }

  /**
   * Overlap rule from the project spec:
   *   existing.start < requested.end AND existing.end > requested.start
   * Half-open intervals: back-to-back bookings do NOT overlap.
   */
  overlaps(other: TimeInterval): boolean {
    return this.startAt.getTime() < other.endAt.getTime() &&
      this.endAt.getTime() > other.startAt.getTime();
  }

  durationMinutes(): number {
    return Math.round((this.endAt.getTime() - this.startAt.getTime()) / 60_000);
  }
}

export interface AppointmentProps {
  id: string;
  businessId: string;
  customerId: string;
  serviceId: string;
  staffId: string;
  interval: TimeInterval;
  status: AppointmentStatus;
  priceMinor: number;
  currency: string;
  notes?: string | null;
}

/** Appointment aggregate root. Enforces lifecycle invariants. */
export class Appointment {
  private constructor(private props: AppointmentProps) {}

  static create(props: AppointmentProps): Appointment {
    if (props.priceMinor < 0) {
      throw new ValidationError('Price cannot be negative');
    }
    return new Appointment(props);
  }

  get id(): string {
    return this.props.id;
  }
  get businessId(): string {
    return this.props.businessId;
  }
  get staffId(): string {
    return this.props.staffId;
  }
  get interval(): TimeInterval {
    return this.props.interval;
  }
  get status(): AppointmentStatus {
    return this.props.status;
  }

  private assertActive(): void {
    if (this.props.status !== 'SCHEDULED') {
      throw new ValidationError(
        `Cannot modify an appointment in status ${this.props.status}`,
      );
    }
  }

  reschedule(interval: TimeInterval): void {
    this.assertActive();
    this.props.interval = interval;
  }

  cancel(): void {
    this.assertActive();
    this.props.status = 'CANCELLED';
  }

  complete(): void {
    this.assertActive();
    this.props.status = 'COMPLETED';
  }

  markNoShow(): void {
    this.assertActive();
    this.props.status = 'NO_SHOW';
  }

  snapshot(): Readonly<AppointmentProps> {
    return { ...this.props };
  }
}
