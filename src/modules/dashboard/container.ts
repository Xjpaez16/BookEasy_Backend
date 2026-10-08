import { db } from '../../infrastructure/db/client';
import { HmacTokenService } from '../../infrastructure/security/token-service';
import { SystemClock } from '../../infrastructure/security/system-services';
import { DrizzleMembershipRepository } from '../business/adapters/persistence/membership-repository';
import { DrizzleBusinessRepository } from '../business/adapters/persistence/business-repository';
import { DrizzleDashboardMetricsRepository } from './adapters/persistence/dashboard-metrics-repository';

/** Wires the concrete adapters the dashboard use case depends on. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createDashboardContainer() {
  return {
    metrics: new DrizzleDashboardMetricsRepository(db),
    businesses: new DrizzleBusinessRepository(db),
    memberships: new DrizzleMembershipRepository(db),
    tokens: new HmacTokenService(),
    clock: new SystemClock(),
  };
}

export type DashboardContainer = ReturnType<typeof createDashboardContainer>;
