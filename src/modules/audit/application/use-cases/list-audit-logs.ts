import type {
  AuditLogPage,
  AuditLogReader,
} from '../ports';

export interface ListAuditLogsInput {
  businessId: string;
  action?: string | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
}

export interface ListAuditLogsDeps {
  reader: AuditLogReader;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Returns a paginated, tenant-scoped slice of the audit trail, newest first.
 * `businessId` is supplied by the caller from the authenticated context — the
 * reader enforces it in every query, so one business never sees another's log.
 */
export async function listAuditLogs(
  input: ListAuditLogsInput,
  deps: ListAuditLogsDeps,
): Promise<AuditLogPage> {
  const limit = clamp(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = Math.max(0, Math.trunc(input.offset ?? 0));
  const action = input.action?.trim() ? input.action.trim() : undefined;

  return deps.reader.list({
    businessId: input.businessId,
    action,
    limit,
    offset,
  });
}

function clamp(value: number, min: number, max: number): number {
  const n = Math.trunc(value);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}
