import { db } from '../../infrastructure/db/client';
import { HmacTokenService } from '../../infrastructure/security/token-service';
import {
  SystemClock,
  UuidGenerator,
} from '../../infrastructure/security/system-services';
import { DrizzleMembershipRepository } from '../business/adapters/persistence/membership-repository';
import { DrizzleAuditLogRepository } from '../business/adapters/persistence/audit-log-repository';
import { DrizzleCustomerRepository } from './adapters/persistence/customer-repository';

/** Wires the concrete adapters the customers use cases depend on. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createCustomersContainer() {
  return {
    customers: new DrizzleCustomerRepository(db),
    memberships: new DrizzleMembershipRepository(db),
    audit: new DrizzleAuditLogRepository(db),
    tokens: new HmacTokenService(),
    clock: new SystemClock(),
    ids: new UuidGenerator(),
  };
}

export type CustomersContainer = ReturnType<typeof createCustomersContainer>;
