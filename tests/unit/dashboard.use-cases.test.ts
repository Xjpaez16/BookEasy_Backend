import { describe, it, expect } from 'bun:test';
import { localDayWindow } from '../../src/modules/dashboard/domain/local-day';
import { getDashboardSummary } from '../../src/modules/dashboard/application/use-cases/get-dashboard-summary';
import type {
  DashboardMetricsRepository,
  StatusBreakdown,
  AppointmentSummaryRow,
} from '../../src/modules/dashboard/application/ports';
import { Business } from '../../src/modules/business/domain/business';
import { InMemoryBusinessRepository } from './business-fakes';
import { FixedClock } from './auth-fakes';
import { NotFoundError } from '../../src/shared/domain/errors';

describe('localDayWindow', () => {
  it('maps a Bogota (UTC-5) local day to the right UTC window', () => {
    // 2026-01-05 09:00 Bogota = 14:00Z. Local day = 2026-01-05 00:00..next 00:00
    // which in UTC is 05:00Z that day to 05:00Z next day.
    const { from, to } = localDayWindow(new Date('2026-01-05T14:00:00Z'), 'America/Bogota');
    expect(from.toISOString()).toBe('2026-01-05T05:00:00.000Z');
    expect(to.toISOString()).toBe('2026-01-06T05:00:00.000Z');
  });

  it('handles a late-UTC instant that is still "yesterday" locally', () => {
    // 2026-01-06 02:00Z = 2026-01-05 21:00 Bogota → still the 5th locally.
    const { from } = localDayWindow(new Date('2026-01-06T02:00:00Z'), 'America/Bogota');
    expect(from.toISOString()).toBe('2026-01-05T05:00:00.000Z');
  });

  it('maps a positive-offset zone (Madrid, UTC+1 in January)', () => {
    // Madrid is UTC+1 in winter → local midnight = 23:00Z previous day.
    const { from, to } = localDayWindow(new Date('2026-01-05T10:00:00Z'), 'Europe/Madrid');
    expect(from.toISOString()).toBe('2026-01-04T23:00:00.000Z');
    expect(to.toISOString()).toBe('2026-01-05T23:00:00.000Z');
  });
});

class FakeMetrics implements DashboardMetricsRepository {
  constructor(
    private readonly data: {
      breakdown: StatusBreakdown;
      upcoming: AppointmentSummaryRow[];
      customers: number;
      services: number;
    },
  ) {}
  async statusBreakdown(): Promise<StatusBreakdown> {
    return this.data.breakdown;
  }
  async upcoming(): Promise<AppointmentSummaryRow[]> {
    return this.data.upcoming;
  }
  async activeCustomerCount(): Promise<number> {
    return this.data.customers;
  }
  async activeServiceCount(): Promise<number> {
    return this.data.services;
  }
}

describe('getDashboardSummary', () => {
  // eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test helper, type inferred
  async function deps(breakdown: StatusBreakdown) {
    const businesses = new InMemoryBusinessRepository();
    await businesses.save(
      Business.create({ id: 'b1', name: 'Shop', timezone: 'America/Bogota' }),
    );
    return {
      metrics: new FakeMetrics({
        breakdown,
        upcoming: [
          {
            id: 'a1',
            customerId: 'c1',
            serviceId: 's1',
            staffId: 'st1',
            startAt: new Date('2026-01-05T15:00:00Z'),
            endAt: new Date('2026-01-05T15:30:00Z'),
            status: 'SCHEDULED' as const,
          },
        ],
        customers: 42,
        services: 7,
      }),
      businesses,
      clock: new FixedClock(new Date('2026-01-05T14:00:00Z')),
    };
  }

  it('composes totals, breakdown and the local-day window', async () => {
    const d = await deps({ SCHEDULED: 3, COMPLETED: 2, CANCELLED: 1, NO_SHOW: 1 });
    const summary = await getDashboardSummary('b1', d);
    expect(summary.timezone).toBe('America/Bogota');
    expect(summary.today.total).toBe(7);
    expect(summary.today.from).toBe('2026-01-05T05:00:00.000Z');
    expect(summary.upcoming).toHaveLength(1);
    expect(summary.totals.activeCustomers).toBe(42);
    expect(summary.totals.activeServices).toBe(7);
  });

  it('throws when the business does not exist', async () => {
    const d = await deps({ SCHEDULED: 0, COMPLETED: 0, CANCELLED: 0, NO_SHOW: 0 });
    await expect(getDashboardSummary('missing', d)).rejects.toBeInstanceOf(NotFoundError);
  });
});
