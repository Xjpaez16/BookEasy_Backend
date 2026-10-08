import { describe, it, expect, beforeEach } from 'bun:test';
import { createAppointment } from '../../src/modules/appointments/application/use-cases/create-appointment';
import {
  rescheduleAppointment,
  transitionAppointment,
  listAppointments,
} from '../../src/modules/appointments/application/use-cases/manage-appointments';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../src/shared/domain/errors';
import { Business } from '../../src/modules/business/domain/business';
import {
  InMemoryAppointmentRepository,
  InMemoryBusinessHoursRepository,
  FakeServiceLookup,
  FakeCustomerLookup,
  FakeStaffLookup,
} from './appointment-fakes';
import {
  InMemoryBusinessRepository,
  CapturingAuditLog,
  FakeUnitOfWork,
} from './business-fakes';
import { FixedClock, SeqIdGenerator } from './auth-fakes';

const BUSINESS = 'biz-1';
// 2026-01-05 is a Monday. Business in Bogota (UTC-5), open Mon 09:00–18:00.
const MON_09_LOCAL = '2026-01-05T14:00:00Z';

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, type inferred
async function makeDeps(overrides?: {
  serviceActive?: boolean;
  serviceDeleted?: boolean;
  customerPresent?: boolean;
  staffActive?: boolean;
}) {
  const businesses = new InMemoryBusinessRepository();
  await businesses.save(
    Business.create({ id: BUSINESS, name: 'Barber Shop', timezone: 'America/Bogota' }),
  );
  const hours = new InMemoryBusinessHoursRepository();
  await hours.replaceForBusiness(BUSINESS, [
    { weekday: 1, openMinute: 540, closeMinute: 1080 },
  ]);

  return {
    appointments: new InMemoryAppointmentRepository(),
    hours,
    businesses,
    services: new FakeServiceLookup({
      id: 'svc-1',
      durationMinutes: 30,
      priceMinor: 1500,
      currency: 'USD',
      active: overrides?.serviceActive ?? true,
      deleted: overrides?.serviceDeleted ?? false,
    }),
    customers: new FakeCustomerLookup(overrides?.customerPresent ?? true),
    staff: new FakeStaffLookup(overrides?.staffActive ?? true),
    audit: new CapturingAuditLog(),
    ids: new SeqIdGenerator(),
    clock: new FixedClock(new Date('2026-01-01T00:00:00Z')),
    uow: new FakeUnitOfWork(),
  };
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, type inferred
function baseInput() {
  return {
    actorUserId: 'u1',
    businessId: BUSINESS,
    customerId: 'cust-1',
    serviceId: 'svc-1',
    staffId: 'staff-1',
    startAt: MON_09_LOCAL,
  };
}

describe('createAppointment', () => {
  it('books a valid in-hours slot and copies the service price', async () => {
    const deps = await makeDeps();
    const appt = await createAppointment(baseInput(), deps);
    expect(appt.status).toBe('SCHEDULED');
    expect(appt.priceMinor).toBe(1500);
    expect(appt.endAt).toBe('2026-01-05T14:30:00.000Z');
  });

  it('rejects an overlapping slot for the same staff', async () => {
    const deps = await makeDeps();
    await createAppointment(baseInput(), deps);
    // Second booking starts 15 min into the first => overlaps.
    await expect(
      createAppointment({ ...baseInput(), startAt: '2026-01-05T14:15:00Z' }, deps),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('allows a back-to-back slot (half-open, no overlap)', async () => {
    const deps = await makeDeps();
    await createAppointment(baseInput(), deps);
    const next = await createAppointment(
      { ...baseInput(), startAt: '2026-01-05T14:30:00Z' },
      deps,
    );
    expect(next.status).toBe('SCHEDULED');
  });

  it('rejects a slot outside business hours', async () => {
    const deps = await makeDeps();
    // 08:30 Bogota (13:30Z) is before opening.
    await expect(
      createAppointment({ ...baseInput(), startAt: '2026-01-05T13:30:00Z' }, deps),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an inactive service', async () => {
    const deps = await makeDeps({ serviceActive: false });
    await expect(createAppointment(baseInput(), deps)).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a deleted service as not found', async () => {
    const deps = await makeDeps({ serviceDeleted: true });
    await expect(createAppointment(baseInput(), deps)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects a missing customer', async () => {
    const deps = await makeDeps({ customerPresent: false });
    await expect(createAppointment(baseInput(), deps)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects an inactive staff member', async () => {
    const deps = await makeDeps({ staffActive: false });
    await expect(createAppointment(baseInput(), deps)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('appointment lifecycle use cases', () => {
  let deps: Awaited<ReturnType<typeof makeDeps>>;
  let apptId: string;

  beforeEach(async () => {
    deps = await makeDeps();
    const appt = await createAppointment(baseInput(), deps);
    apptId = appt.id;
  });

  it('reschedules to another in-hours slot', async () => {
    const moved = await rescheduleAppointment(
      { actorUserId: 'u1', businessId: BUSINESS, appointmentId: apptId, startAt: '2026-01-05T15:00:00Z' },
      deps,
    );
    expect(moved.startAt).toBe('2026-01-05T15:00:00.000Z');
  });

  it('rejects rescheduling onto another appointment of the same staff', async () => {
    await createAppointment({ ...baseInput(), startAt: '2026-01-05T15:00:00Z' }, deps);
    await expect(
      rescheduleAppointment(
        { actorUserId: 'u1', businessId: BUSINESS, appointmentId: apptId, startAt: '2026-01-05T15:00:00Z' },
        deps,
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('cancels, and then rejects a second transition', async () => {
    await transitionAppointment('cancel', { actorUserId: 'u1', businessId: BUSINESS, appointmentId: apptId }, deps);
    await expect(
      transitionAppointment('complete', { actorUserId: 'u1', businessId: BUSINESS, appointmentId: apptId }, deps),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('completes and marks no-show on fresh appointments', async () => {
    const completed = await transitionAppointment(
      'complete',
      { actorUserId: 'u1', businessId: BUSINESS, appointmentId: apptId },
      deps,
    );
    expect(completed.status).toBe('COMPLETED');

    const other = await createAppointment({ ...baseInput(), startAt: '2026-01-05T16:00:00Z' }, deps);
    const noShow = await transitionAppointment(
      'no_show',
      { actorUserId: 'u1', businessId: BUSINESS, appointmentId: other.id },
      deps,
    );
    expect(noShow.status).toBe('NO_SHOW');
  });

  it('lists appointments in a UTC range', async () => {
    const list = await listAppointments(
      { businessId: BUSINESS, from: '2026-01-05T00:00:00Z', to: '2026-01-06T00:00:00Z' },
      deps,
    );
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it('tenant isolation: cannot touch an appointment of another business', async () => {
    await expect(
      transitionAppointment(
        'cancel',
        { actorUserId: 'attacker', businessId: 'other-biz', appointmentId: apptId },
        deps,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
