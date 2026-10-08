import { Appointment, TimeInterval } from '../../src/modules/appointments/domain/appointment';
import type { AppointmentStatus } from '../../src/modules/appointments/domain/appointment';
import type { BusinessHour } from '../../src/modules/appointments/domain/business-hours';
import type {
  AppointmentRepository,
  BusinessHoursRepository,
  ServiceLookup,
  CustomerLookup,
  StaffLookup,
} from '../../src/modules/appointments/application/ports';

export class InMemoryAppointmentRepository implements AppointmentRepository {
  rows: Appointment[] = [];

  async findById(businessId: string, id: string): Promise<Appointment | null> {
    return this.rows.find((a) => a.id === id && a.businessId === businessId) ?? null;
  }

  async findOverlapsForStaff(params: {
    businessId: string;
    staffId: string;
    startAt: Date;
    endAt: Date;
    excludeId?: string;
  }): Promise<Appointment[]> {
    return this.rows.filter((a) => {
      const s = a.snapshot();
      if (s.businessId !== params.businessId) return false;
      if (s.staffId !== params.staffId) return false;
      if (s.status !== 'SCHEDULED') return false;
      if (params.excludeId && s.id === params.excludeId) return false;
      // half-open overlap
      return (
        s.interval.startAt.getTime() < params.endAt.getTime() &&
        s.interval.endAt.getTime() > params.startAt.getTime()
      );
    });
  }

  async listInRange(params: {
    businessId: string;
    from: Date;
    to: Date;
    staffId?: string;
    status?: AppointmentStatus;
  }): Promise<Appointment[]> {
    return this.rows.filter((a) => {
      const s = a.snapshot();
      if (s.businessId !== params.businessId) return false;
      if (s.interval.startAt < params.from || s.interval.startAt > params.to) return false;
      if (params.staffId && s.staffId !== params.staffId) return false;
      if (params.status && s.status !== params.status) return false;
      return true;
    });
  }

  async save(appointment: Appointment): Promise<void> {
    const idx = this.rows.findIndex((a) => a.id === appointment.id);
    if (idx >= 0) this.rows[idx] = appointment;
    else this.rows.push(appointment);
  }
}

export class InMemoryBusinessHoursRepository implements BusinessHoursRepository {
  private byBusiness = new Map<string, BusinessHour[]>();
  async listByBusiness(businessId: string): Promise<BusinessHour[]> {
    return this.byBusiness.get(businessId) ?? [];
  }
  async replaceForBusiness(businessId: string, hours: BusinessHour[]): Promise<void> {
    this.byBusiness.set(businessId, [...hours]);
  }
}

export class FakeServiceLookup implements ServiceLookup {
  constructor(
    private readonly svc: {
      id: string;
      durationMinutes: number;
      priceMinor: number;
      currency: string;
      active: boolean;
      deleted: boolean;
    } | null,
  ) {}
  async find(): Promise<ReturnType<ServiceLookup['find']> extends Promise<infer T> ? T : never> {
    return this.svc as never;
  }
}

export class FakeCustomerLookup implements CustomerLookup {
  constructor(private readonly present: boolean) {}
  async exists(): Promise<boolean> {
    return this.present;
  }
}

export class FakeStaffLookup implements StaffLookup {
  constructor(private readonly active: boolean) {}
  async isActiveMember(): Promise<boolean> {
    return this.active;
  }
}

/** Builds a TimeInterval helper for tests. */
export function interval(startIso: string, minutes: number): TimeInterval {
  return TimeInterval.fromDuration(new Date(startIso), minutes);
}
