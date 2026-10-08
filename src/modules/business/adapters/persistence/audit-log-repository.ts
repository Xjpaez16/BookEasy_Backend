import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import type { AuditEntry, AuditLogRepository } from '../../application/ports';

/** Drizzle-backed, append-only audit trail. Never stores secrets. */
export class DrizzleAuditLogRepository implements AuditLogRepository {
  constructor(private readonly db: Database) {}

  async record(entry: AuditEntry, tx?: TransactionContext): Promise<void> {
    await txDb(this.db, tx)
      .insert(schema.auditLogs)
      .values({
        businessId: entry.businessId,
        actorUserId: entry.actorUserId,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ?? null,
      });
  }
}
