import { db } from '../../infrastructure/db/client';
import { DrizzleUnitOfWork } from '../../infrastructure/db/unit-of-work';
import { Argon2PasswordHasher } from '../../infrastructure/security/password-hasher';
import { HmacTokenService } from '../../infrastructure/security/token-service';
import {
  SystemClock,
  UuidGenerator,
} from '../../infrastructure/security/system-services';

import { DrizzleUserRepository } from '../auth/adapters/persistence/user-repository';
import { DrizzleBusinessRepository } from './adapters/persistence/business-repository';
import { DrizzleMembershipRepository } from './adapters/persistence/membership-repository';
import { DrizzleAuditLogRepository } from './adapters/persistence/audit-log-repository';

/** Wires the concrete adapters the business/staff use cases depend on. */
// Return type intentionally inferred (container shape).
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createBusinessContainer() {
  return {
    businesses: new DrizzleBusinessRepository(db),
    memberships: new DrizzleMembershipRepository(db),
    users: new DrizzleUserRepository(db),
    audit: new DrizzleAuditLogRepository(db),
    hasher: new Argon2PasswordHasher(),
    tokens: new HmacTokenService(),
    clock: new SystemClock(),
    ids: new UuidGenerator(),
    uow: new DrizzleUnitOfWork(db),
  };
}

export type BusinessContainer = ReturnType<typeof createBusinessContainer>;
