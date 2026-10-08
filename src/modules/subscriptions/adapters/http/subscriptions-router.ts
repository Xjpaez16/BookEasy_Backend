import { Elysia } from 'elysia';
import { ValidationError } from '../../../../shared/domain/errors';
import {
  authPlugin,
  assertAuth,
  assertBusiness,
  assertRole,
} from '../../../../infrastructure/http/auth-plugin';
import type { AuthContext } from '../../../../infrastructure/http/auth-context';
import { createSubscriptionsContainer } from '../../container';
import { changePlanSchema } from './schemas';
import {
  getSubscription,
  changePlan,
  cancelSubscription,
} from '../../application/use-cases/manage-subscription';

const container = createSubscriptionsContainer();

function parse<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  body: unknown,
): T {
  const result = schema.safeParse(body);
  if (!result.success || result.data === undefined) {
    throw new ValidationError('Invalid request body');
  }
  return result.data;
}

/**
 * Subscription router. Controllers only: validate → authenticate → require
 * active business → (role) → call use case. `businessId` always comes from
 * `auth`, never the body — a business can only read/change its own plan.
 */
export const subscriptionsRouter = new Elysia({ prefix: '/api/v1/subscription' })
  .use(
    authPlugin({ tokens: container.tokens, memberships: container.memberships }),
  )

  // Any active member can see the current plan + limits.
  .get('/', async ({ auth }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    const sub = await getSubscription(
      { businessId: principal.businessId },
      container,
    );
    return sub.toJSON();
  })

  // Only OWNER can change the plan (monetization control).
  .put('/', async ({ auth, body }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    assertRole(principal, 'OWNER');
    const input = parse(changePlanSchema, body);
    const sub = await changePlan(
      {
        businessId: principal.businessId,
        actorUserId: principal.userId,
        plan: input.plan,
      },
      container,
    );
    return sub.toJSON();
  })

  // Only OWNER can cancel.
  .delete('/', async ({ auth }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    assertRole(principal, 'OWNER');
    const sub = await cancelSubscription(
      { businessId: principal.businessId, actorUserId: principal.userId },
      container,
    );
    return sub.toJSON();
  });
