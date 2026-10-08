import { Elysia } from 'elysia';
import { ValidationError } from '../../../../shared/domain/errors';
import {
  authPlugin,
  assertAuth,
  assertBusiness,
  assertRole,
} from '../../../../infrastructure/http/auth-plugin';
import type { AuthContext } from '../../../../infrastructure/http/auth-context';
import { createAuditContainer } from '../../container';
import { listAuditLogsQuerySchema } from './schemas';
import { listAuditLogs } from '../../application/use-cases/list-audit-logs';

const container = createAuditContainer();

function parse<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) {
    throw new ValidationError('Invalid query parameters');
  }
  return result.data;
}

/**
 * Audit-log router. Controllers only: validate → authenticate → require active
 * business → OWNER → call use case. `businessId` always comes from `auth`,
 * never the query — a business can only read its own audit trail.
 */
export const auditLogsRouter = new Elysia({ prefix: '/api/v1/audit-logs' })
  .use(
    authPlugin({ tokens: container.tokens, memberships: container.memberships }),
  )

  // Only OWNER can read the audit trail (sensitive operational history).
  .get('/', async ({ auth, query }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    assertRole(principal, 'OWNER');

    const params = parse(listAuditLogsQuerySchema, query ?? {});
    const page = await listAuditLogs(
      {
        businessId: principal.businessId,
        action: params.action,
        limit: params.limit,
        offset: params.offset,
      },
      container,
    );

    return {
      items: page.items.map((it) => ({
        id: it.id,
        actorUserId: it.actorUserId,
        action: it.action,
        targetType: it.targetType,
        targetId: it.targetId,
        metadata: it.metadata,
        createdAt: it.createdAt.toISOString(),
      })),
      limit: page.limit,
      offset: page.offset,
      total: page.total,
    };
  });
