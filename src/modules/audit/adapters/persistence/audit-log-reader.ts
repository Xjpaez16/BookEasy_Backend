import { and, eq, ilike, desc, count } from 'drizzle-orm';
import type { Database } from '../../../../infrastructure/db/client';
import { schema } from '../../../../infrastructure/db/client';
import { txDb } from '../../../../infrastructure/db/unit-of-work';
import type { TransactionContext } from '../../../../shared/application/ports';
import type {
  AuditLogPage,
  AuditLogReader,
  AuditLogRecord,
  ListAuditLogsQuery,
} from '../../application/ports';

/**
 * Drizzle-backed read side of the audit trail. Every query is scoped by
 * `business_id` (tenant isolation at the data layer) and ordered newest-first.
 */
export class DrizzleAuditLogReader implements AuditLogReader {
  constructor(private readonly db: Database) {}

  async list(
    query: ListAuditLogsQuery,
    tx?: TransactionContext,
  ): Promise<AuditLogPage> {
    const d = txDb(this.db, tx);

    const where = and(
      eq(schema.auditLogs.businessId, query.businessId),
      query.action ? ilike(schema.auditLogs.action, `%${query.action}%`) : undefined,
    );

    const rows = await d
      .select()
      .from(schema.auditLogs)
      .where(where)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(query.limit)
      .offset(query.offset);

    const totalRows = await d
      .select({ value: count() })
      .from(schema.auditLogs)
      .where(where);
    const total = totalRows[0]?.value ?? 0;

    return {
      items: rows.map(toRecord),
      limit: query.limit,
      offset: query.offset,
      total,
    };
  }
}

function toRecord(row: typeof schema.auditLogs.$inferSelect): AuditLogRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    actorUserId: row.actorUserId,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata,
    createdAt: row.createdAt,
  };
}
