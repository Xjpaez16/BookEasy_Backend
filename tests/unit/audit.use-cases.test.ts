import { describe, it, expect } from 'bun:test';
import {
  listAuditLogs,
  type ListAuditLogsDeps,
} from '../../src/modules/audit/application/use-cases/list-audit-logs';
import type {
  AuditLogPage,
  AuditLogReader,
  AuditLogRecord,
  ListAuditLogsQuery,
} from '../../src/modules/audit/application/ports';

/** In-memory reader enforcing business_id scoping + newest-first ordering. */
class InMemoryAuditLogReader implements AuditLogReader {
  constructor(private readonly rows: AuditLogRecord[]) {}

  async list(query: ListAuditLogsQuery): Promise<AuditLogPage> {
    let scoped = this.rows.filter((r) => r.businessId === query.businessId);
    if (query.action) {
      const needle = query.action.toLowerCase();
      scoped = scoped.filter((r) => r.action.toLowerCase().includes(needle));
    }
    scoped.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = scoped.length;
    const items = scoped.slice(query.offset, query.offset + query.limit);
    return { items, limit: query.limit, offset: query.offset, total };
  }
}

function row(
  id: string,
  businessId: string,
  action: string,
  epochMs: number,
): AuditLogRecord {
  return {
    id,
    businessId,
    actorUserId: 'actor-1',
    action,
    targetType: 'business',
    targetId: 'tgt-1',
    metadata: null,
    createdAt: new Date(epochMs),
  };
}

function makeDeps(rows: AuditLogRecord[]): ListAuditLogsDeps {
  return { reader: new InMemoryAuditLogReader(rows) };
}

const biz = 'biz-1';
const other = 'biz-2';

describe('listAuditLogs', () => {
  it('returns newest first with total count', async () => {
    const deps = makeDeps([
      row('1', biz, 'business.created', 1000),
      row('2', biz, 'staff.invited', 3000),
      row('3', biz, 'subscription.changed', 2000),
    ]);
    const page = await listAuditLogs({ businessId: biz }, deps);
    expect(page.total).toBe(3);
    expect(page.items.map((i) => i.id)).toEqual(['2', '3', '1']);
  });

  it('never returns rows from another business (tenant isolation)', async () => {
    const deps = makeDeps([
      row('1', biz, 'business.created', 1000),
      row('2', other, 'business.created', 2000),
    ]);
    const page = await listAuditLogs({ businessId: biz }, deps);
    expect(page.total).toBe(1);
    expect(page.items[0]?.businessId).toBe(biz);
  });

  it('filters by action substring (case-insensitive)', async () => {
    const deps = makeDeps([
      row('1', biz, 'staff.invited', 1000),
      row('2', biz, 'staff.role_changed', 2000),
      row('3', biz, 'service.created', 3000),
    ]);
    const page = await listAuditLogs({ businessId: biz, action: 'STAFF' }, deps);
    expect(page.total).toBe(2);
    expect(page.items.map((i) => i.action).every((a) => a.includes('staff'))).toBe(true);
  });

  it('paginates with limit and offset', async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      row(String(i), biz, 'x', i * 100),
    );
    const deps = makeDeps(rows);
    const page = await listAuditLogs({ businessId: biz, limit: 3, offset: 3 }, deps);
    expect(page.total).toBe(10);
    expect(page.items.length).toBe(3);
    expect(page.limit).toBe(3);
    expect(page.offset).toBe(3);
  });

  it('clamps limit to the max and floors a negative offset', async () => {
    let captured: ListAuditLogsQuery | undefined;
    const deps: ListAuditLogsDeps = {
      reader: {
        async list(q) {
          captured = q;
          return { items: [], limit: q.limit, offset: q.offset, total: 0 };
        },
      },
    };
    await listAuditLogs({ businessId: biz, limit: 9999, offset: -5 }, deps);
    expect(captured?.limit).toBe(100);
    expect(captured?.offset).toBe(0);
  });

  it('defaults limit to 50 when not provided', async () => {
    let captured: ListAuditLogsQuery | undefined;
    const deps: ListAuditLogsDeps = {
      reader: {
        async list(q) {
          captured = q;
          return { items: [], limit: q.limit, offset: q.offset, total: 0 };
        },
      },
    };
    await listAuditLogs({ businessId: biz }, deps);
    expect(captured?.limit).toBe(50);
    expect(captured?.offset).toBe(0);
  });
});
