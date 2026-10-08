import { NotFoundError } from '../../../../shared/domain/errors';
import type { Clock } from '../../../../shared/application/ports';
import type { BusinessRepository } from '../../../business/application/ports';
import type {
  DashboardMetricsRepository,
  StatusBreakdown,
} from '../ports';
import { localDayWindow } from '../../domain/local-day';

const UPCOMING_LIMIT = 10;

export interface UpcomingAppointment {
  id: string;
  customerId: string;
  serviceId: string;
  staffId: string;
  startAt: string;
  endAt: string;
}

export interface DashboardSummary {
  timezone: string;
  today: {
    /** Local day window, as UTC ISO bounds, for client reference. */
    from: string;
    to: string;
    total: number;
    byStatus: StatusBreakdown;
  };
  upcoming: UpcomingAppointment[];
  totals: {
    activeCustomers: number;
    activeServices: number;
  };
}

export interface DashboardDeps {
  metrics: DashboardMetricsRepository;
  businesses: BusinessRepository;
  clock: Clock;
}

/**
 * Builds the dashboard summary for the caller's business. Read-only; "today"
 * is the business-LOCAL day converted to a UTC window so counts match what the
 * business sees on its own clock.
 */
export async function getDashboardSummary(
  businessId: string,
  deps: DashboardDeps,
): Promise<DashboardSummary> {
  const business = await deps.businesses.findById(businessId);
  if (!business) throw new NotFoundError('Business not found');

  const now = deps.clock.now();
  const { from, to } = localDayWindow(now, business.timezone);

  const [byStatus, upcomingRows, activeCustomers, activeServices] = await Promise.all([
    deps.metrics.statusBreakdown(businessId, from, to),
    deps.metrics.upcoming(businessId, now, UPCOMING_LIMIT),
    deps.metrics.activeCustomerCount(businessId),
    deps.metrics.activeServiceCount(businessId),
  ]);

  const total =
    byStatus.SCHEDULED + byStatus.COMPLETED + byStatus.CANCELLED + byStatus.NO_SHOW;

  return {
    timezone: business.timezone,
    today: { from: from.toISOString(), to: to.toISOString(), total, byStatus },
    upcoming: upcomingRows.map((r) => ({
      id: r.id,
      customerId: r.customerId,
      serviceId: r.serviceId,
      staffId: r.staffId,
      startAt: r.startAt.toISOString(),
      endAt: r.endAt.toISOString(),
    })),
    totals: { activeCustomers, activeServices },
  };
}
