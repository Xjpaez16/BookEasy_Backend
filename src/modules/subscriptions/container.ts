import { db } from '../../infrastructure/db/client';
import { DrizzleUnitOfWork } from '../../infrastructure/db/unit-of-work';
import {
  SystemClock,
  UuidGenerator,
} from '../../infrastructure/security/system-services';
import { HmacTokenService } from '../../infrastructure/security/token-service';

import { DrizzleMembershipRepository } from '../business/adapters/persistence/membership-repository';
import { DrizzleAuditLogRepository } from '../business/adapters/persistence/audit-log-repository';
import { DrizzleSubscriptionRepository } from './adapters/persistence/subscription-repository';

/** Wires the concrete adapters the subscription use cases depend on. */
// Return type intentionally inferred (container shape).
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createSubscriptionsContainer() {
  return {
    subscriptions: new DrizzleSubscriptionRepository(db),
    memberships: new DrizzleMembershipRepository(db),
    audit: new DrizzleAuditLogRepository(db),
    tokens: new HmacTokenService(),
    clock: new SystemClock(),
    ids: new UuidGenerator(),
    uow: new DrizzleUnitOfWork(db),
  };
}

export type SubscriptionsContainer = ReturnType<
  typeof createSubscriptionsContainer
>;
