import { db } from '../../infrastructure/db/client';
import { HmacTokenService } from '../../infrastructure/security/token-service';
import { DrizzleMembershipRepository } from '../business/adapters/persistence/membership-repository';
import { DrizzleAuditLogReader } from './adapters/persistence/audit-log-reader';

/** Wires the concrete adapters the audit-log read use case depends on. */
// Return type intentionally inferred (container shape).
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createAuditContainer() {
  return {
    reader: new DrizzleAuditLogReader(db),
    tokens: new HmacTokenService(),
    memberships: new DrizzleMembershipRepository(db),
  };
}

export type AuditContainer = ReturnType<typeof createAuditContainer>;
