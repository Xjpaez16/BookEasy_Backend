import { describe, it, expect, beforeEach } from 'bun:test';
import { getAvailability } from '../../src/modules/public-booking/application/use-cases/get-availability';
import { bookPublicAppointment } from '../../src/modules/public-booking/application/use-cases/book-public-appointment';
import {
  listMyAppointments,
  cancelMyAppointment,
  rescheduleMyAppointment,
} from '../../src/modules/public-booking/application/use-cases/my-appointments';
import type {
  PublicBookingReader,
  PublicBusinessRef,
  PublicServiceRef,
  AssignableStaff,
} from '../../src/modules/public-booking/application/ports';
import { Appointment, TimeInterval } from '../../src/modules/appointments/domain/appointment';
import type { AppointmentStatus } from '../../src/modules/appointments/domain/appointment';
import type { BusinessHour } from '../../src/modules/appointments/domain/business-hours';
import { ConflictError, NotFoundError, ValidationError } from '../../src/shared/domain/errors';
import { InMemoryAppointmentRepository } from './appointment-fakes';
import { CapturingAuditLog, FakeUnitOfWork } from './business-fakes';
import { FixedClock, SeqIdGenerator } from './auth-fakes';

const BIZ = 'biz-1';
const SLUG = 'cat-salon';
// Bogota (UTC-5). 2026-01-05 is a Monday. 09:00 local = 14:00Z.
const TZ = 'America/Bogota';

/**
 * In-memory reader for the public booking flow. Backs onto the SAME
 * InMemoryAppointmentRepository the use cases write through, so availability
 * and overlap see the bookings the tests create.
 */
class FakeReader implements PublicBookingReader {
  customers: Array<{ id: string; businessId: string; userId: string }> = [];
  private seq = 0;

  constructor(
    private readonly appts: InMemoryAppointmentRepository,
    private readonly opts: {
      business: PublicBusinessRef | null;
      service: PublicServiceRef | null;
      hours: BusinessHour[];
      staff: AssignableStaff[];
    },
  ) {}

  async findBusinessBySlug(slug: string): Promise<PublicBusinessRef | null> {
    return this.opts.business && slug === this.opts.business.slug
      ? this.opts.business
      : null;
  }
  async findService(_b: string, serviceId: string): Promise<PublicServiceRef | null> {
    return this.opts.service && serviceId === this.opts.service.id
      ? this.opts.service
      : null;
  }
  async listBusinessHours(): Promise<BusinessHour[]> {
    return this.opts.hours;
  }
  async listAssignableStaff(): Promise<AssignableStaff[]> {
    return this.opts.staff;
  }
  async resolveCustomerForUser(params: {
    businessId: string;
    userId: string;
  }): Promise<string> {
    const found = this.customers.find(
      (c) => c.businessId === params.businessId && c.userId === params.userId,
    );
    if (found) return found.id;
    const id = `cust-${++this.seq}`;
    this.customers.push({ id, businessId: params.businessId, userId: params.userId });
    return id;
  }
  async findCustomerIdForUser(businessId: string, userId: string): Promise<string | null> {
    return (
      this.customers.find((c) => c.businessId === businessId && c.userId === userId)?.id ??
      null
    );
  }
  async listAppointmentsInRange(params: {
    businessId: string;
    from: Date;
    to: Date;
    staffId?: string;
    status?: AppointmentStatus;
  }): Promise<Appointment[]> {
    return this.appts.listInRange(params);
  }
  async listAppointmentsForCustomer(
    businessId: string,
    customerId: string,
  ): Promise<Appointment[]> {
    return this.appts.rows.filter((a) => {
      const s = a.snapshot();
      return s.businessId === businessId && s.customerId === customerId;
    });
  }
  async findAppointment(businessId: string, id: string): Promise<Appointment | null> {
    return this.appts.findById(businessId, id);
  }

  /** Test helper: pre-seed a customer record for a user. */
  seedCustomer(id: string, userId: string): void {
    this.customers.push({ id, businessId: BIZ, userId });
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, type inferred
function makeDeps(overrides?: {
  staff?: AssignableStaff[];
  service?: Partial<PublicServiceRef>;
  hours?: BusinessHour[];
}) {
  const appts = new InMemoryAppointmentRepository();
  const service: PublicServiceRef = {
    id: 'svc-1',
    durationMinutes: 30,
    priceMinor: 1500,
    currency: 'USD',
    active: true,
    deleted: false,
    ...overrides?.service,
  };
  const reader = new FakeReader(appts, {
    business: { id: BIZ, slug: SLUG, name: 'Cat Salon', timezone: TZ },
    service,
    hours: overrides?.hours ?? [{ weekday: 1, openMinute: 540, closeMinute: 1080 }],
    staff: overrides?.staff ?? [{ membershipId: 'm-1' }],
  });
  return {
    reader,
    appts,
    deps: {
      reader,
      appointments: appts,
      audit: new CapturingAuditLog(),
      ids: new SeqIdGenerator(),
      clock: new FixedClock(new Date('2026-01-01T00:00:00Z')),
      uow: new FakeUnitOfWork(),
    },
  };
}

describe('getAvailability', () => {
  it('returns in-hours slots for an open weekday', async () => {
    const { deps } = makeDeps();
    const out = await getAvailability(
      { slug: SLUG, serviceId: 'svc-1', date: '2026-01-05' },
      { reader: deps.reader },
    );
    expect(out.slots.length).toBeGreaterThan(0);
    // First slot is 09:00 Bogota = 14:00Z.
    expect(out.slots[0]).toBe('2026-01-05T14:00:00.000Z');
  });

  it('returns no slots on a closed weekday', async () => {
    const { deps } = makeDeps();
    // 2026-01-04 is a Sunday (weekday 0) — no hours configured.
    const out = await getAvailability(
      { slug: SLUG, serviceId: 'svc-1', date: '2026-01-04' },
      { reader: deps.reader },
    );
    expect(out.slots).toEqual([]);
  });

  it('drops a slot where the only staff member is busy', async () => {
    const { deps, appts } = makeDeps({ staff: [{ membershipId: 'm-1' }] });
    // Book m-1 at 14:00Z for 30 min.
    appts.rows.push(
      Appointment.create({
        id: 'a-busy',
        businessId: BIZ,
        customerId: 'c-x',
        serviceId: 'svc-1',
        staffId: 'm-1',
        interval: TimeInterval.fromDuration(new Date('2026-01-05T14:00:00Z'), 30),
        status: 'SCHEDULED',
        priceMinor: 1500,
        currency: 'USD',
        notes: null,
      }),
    );
    const out = await getAvailability(
      { slug: SLUG, serviceId: 'svc-1', date: '2026-01-05' },
      { reader: deps.reader },
    );
    // 14:00 and 14:15 overlap the booking; both gone. 14:30 is free again.
    expect(out.slots).not.toContain('2026-01-05T14:00:00.000Z');
    expect(out.slots).not.toContain('2026-01-05T14:15:00.000Z');
    expect(out.slots).toContain('2026-01-05T14:30:00.000Z');
  });

  it('keeps a slot when a SECOND staff member is still free', async () => {
    const { deps, appts } = makeDeps({
      staff: [{ membershipId: 'm-1' }, { membershipId: 'm-2' }],
    });
    appts.rows.push(
      Appointment.create({
        id: 'a-busy',
        businessId: BIZ,
        customerId: 'c-x',
        serviceId: 'svc-1',
        staffId: 'm-1',
        interval: TimeInterval.fromDuration(new Date('2026-01-05T14:00:00Z'), 30),
        status: 'SCHEDULED',
        priceMinor: 1500,
        currency: 'USD',
        notes: null,
      }),
    );
    const out = await getAvailability(
      { slug: SLUG, serviceId: 'svc-1', date: '2026-01-05' },
      { reader: deps.reader },
    );
    // m-2 is free at 14:00, so the slot stays bookable.
    expect(out.slots).toContain('2026-01-05T14:00:00.000Z');
  });

  it('throws NotFound for an unknown slug', async () => {
    const { deps } = makeDeps();
    await expect(
      getAvailability({ slug: 'ghost', serviceId: 'svc-1', date: '2026-01-05' }, { reader: deps.reader }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, type inferred
function bookInput(userId = 'u1', startAt = '2026-01-05T14:00:00Z') {
  return {
    userId,
    userFullName: 'Visitor One',
    userEmail: 'v1@example.com',
    slug: SLUG,
    serviceId: 'svc-1',
    startAt,
  };
}

describe('bookPublicAppointment', () => {
  it('books, auto-assigns the free staff, and creates a customer-from-user', async () => {
    const { deps, reader } = makeDeps();
    const appt = await bookPublicAppointment(bookInput(), deps);
    expect(appt.status).toBe('SCHEDULED');
    expect(appt.businessSlug).toBe(SLUG);
    expect(reader.customers).toHaveLength(1);
    expect(reader.customers[0]!.userId).toBe('u1');
  });

  it('reuses the same customer on a second booking by the same user', async () => {
    const { deps, reader } = makeDeps();
    await bookPublicAppointment(bookInput('u1', '2026-01-05T14:00:00Z'), deps);
    await bookPublicAppointment(bookInput('u1', '2026-01-05T15:00:00Z'), deps);
    expect(reader.customers).toHaveLength(1);
  });

  it('auto-assigns a second staff when the first is busy', async () => {
    const { deps } = makeDeps({ staff: [{ membershipId: 'm-1' }, { membershipId: 'm-2' }] });
    const first = await bookPublicAppointment(bookInput('u1'), deps);
    const second = await bookPublicAppointment(bookInput('u2'), deps);
    expect(first.status).toBe('SCHEDULED');
    expect(second.status).toBe('SCHEDULED');
    // Both booked the same slot -> must be different staff under the hood.
    // (We can't read staffId from the public view, so assert both succeeded.)
  });

  it('rejects with Conflict when every staff member is busy at the slot', async () => {
    const { deps } = makeDeps({ staff: [{ membershipId: 'm-1' }] });
    await bookPublicAppointment(bookInput('u1'), deps);
    await expect(bookPublicAppointment(bookInput('u2'), deps)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('rejects a slot outside business hours', async () => {
    const { deps } = makeDeps();
    // 08:30 Bogota (13:30Z) — before opening.
    await expect(
      bookPublicAppointment(bookInput('u1', '2026-01-05T13:30:00Z'), deps),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an inactive service', async () => {
    const { deps } = makeDeps({ service: { active: false } });
    await expect(bookPublicAppointment(bookInput(), deps)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('my-appointments authorization boundary (IDOR)', () => {
  let fixture: ReturnType<typeof makeDeps>;
  let ownId: string;

  beforeEach(async () => {
    fixture = makeDeps();
    // user u1 books -> owns an appointment via customer cust-1.
    const appt = await bookPublicAppointment(bookInput('u1'), fixture.deps);
    ownId = appt.id;
  });

  it('lists only the caller’s own appointments', async () => {
    const mine = await listMyAppointments({ userId: 'u1', slug: SLUG }, fixture.deps);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.id).toBe(ownId);
  });

  it('a user with no bookings here gets NotFound (no leak), not an empty 200', async () => {
    await expect(
      listMyAppointments({ userId: 'stranger', slug: SLUG }, fixture.deps),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cannot cancel another user’s appointment — looks like NotFound', async () => {
    // stranger even has a customer record (booked elsewhere) but not this appt.
    fixture.reader.seedCustomer('cust-stranger', 'stranger');
    await expect(
      cancelMyAppointment(
        { userId: 'stranger', slug: SLUG, appointmentId: ownId },
        fixture.deps,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('cannot reschedule another user’s appointment — looks like NotFound', async () => {
    fixture.reader.seedCustomer('cust-stranger', 'stranger');
    await expect(
      rescheduleMyAppointment(
        {
          userId: 'stranger',
          slug: SLUG,
          appointmentId: ownId,
          startAt: '2026-01-05T15:00:00Z',
        },
        fixture.deps,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('the owner CAN cancel their own appointment', async () => {
    const cancelled = await cancelMyAppointment(
      { userId: 'u1', slug: SLUG, appointmentId: ownId },
      fixture.deps,
    );
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('the owner CAN reschedule their own appointment in-hours', async () => {
    const moved = await rescheduleMyAppointment(
      { userId: 'u1', slug: SLUG, appointmentId: ownId, startAt: '2026-01-05T15:00:00Z' },
      fixture.deps,
    );
    expect(moved.startAt).toBe('2026-01-05T15:00:00.000Z');
  });
});
