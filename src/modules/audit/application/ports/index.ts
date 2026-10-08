import type { TransactionContext } from '../../../../shared/application/ports';

/** A single audit-trail row as read back for display. */
export interface AuditLogRecord {
  id: string;
  businessId: string | null;
  actorUserId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ListAuditLogsQuery {
  businessId: string;
  /** Optional case-insensitive filter on the action name. */
  action?: string | undefined;
  /** Max rows to return (clamped by the use case). */
  limit: number;
  /** Rows to skip for pagination. */
  offset: number;
}

export interface AuditLogPage {
  items: AuditLogRecord[];
  limit: number;
  offset: number;
  total: number;
}

/**
 * Read side of the audit trail. The write side (`AuditLogRepository`) lives in
 * the business module because recording is cross-cutting; reading is a distinct
 * capability (OWNER-only, paginated) and gets its own tenant-scoped port.
 */
export interface AuditLogReader {
  list(query: ListAuditLogsQuery, tx?: TransactionContext): Promise<AuditLogPage>;
}
