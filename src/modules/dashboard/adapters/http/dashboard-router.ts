import { Elysia } from 'elysia';
import {
  authPlugin,
  assertAuth,
  assertBusiness,
} from '../../../../infrastructure/http/auth-plugin';
import type { AuthContext } from '../../../../infrastructure/http/auth-context';
import { createDashboardContainer } from '../../container';
import { getDashboardSummary } from '../../application/use-cases/get-dashboard-summary';

const container = createDashboardContainer();

/**
 * Dashboard router. Read-only aggregation for the caller's business. The
 * `businessId` always comes from `auth`; any active member can view it.
 */
export const dashboardRouter = new Elysia({ prefix: '/api/v1/dashboard' })
  .use(
    authPlugin({ tokens: container.tokens, memberships: container.memberships }),
  )
  .get('/summary', async ({ auth }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    return getDashboardSummary(principal.businessId, container);
  });
