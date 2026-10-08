import { Elysia } from 'elysia';
import { ValidationError } from '../../../../shared/domain/errors';
import {
  authPlugin,
  assertAuth,
  assertBusiness,
  assertRole,
} from '../../../../infrastructure/http/auth-plugin';
import type { AuthContext } from '../../../../infrastructure/http/auth-context';
import { createBusinessContainer } from '../../container';
import {
  createBusinessSchema,
  updateBusinessSchema,
  inviteStaffSchema,
  changeRoleSchema,
} from './schemas';
import { createBusiness } from '../../application/use-cases/create-business';
import {
  getBusiness,
  updateBusiness,
} from '../../application/use-cases/manage-business';
import {
  listStaff,
  inviteStaff,
  changeStaffRole,
  deactivateStaff,
} from '../../application/use-cases/manage-staff';

const container = createBusinessContainer();

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
 * Business + staff router. Controllers only: validate (Zod) → authenticate →
 * authorize (RBAC) → call use case → map to HTTP. No SQL or business rules.
 *
 * Tenant isolation: `businessId` and `role` are read from `auth` (resolved by
 * the auth plugin from active memberships), never from the request body.
 */
export const businessRouter = new Elysia({ prefix: '/api/v1' })
  .use(
    authPlugin({ tokens: container.tokens, memberships: container.memberships }),
  )

  // Create a business — any authenticated user can; they become its OWNER.
  .post('/businesses', async ({ body, auth, set }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    const input = parse(createBusinessSchema, body);
    const result = await createBusiness(
      {
        actorUserId: principal.userId,
        name: input.name,
        ...(input.timezone ? { timezone: input.timezone } : {}),
        ...(input.slug ? { slug: input.slug } : {}),
      },
      container,
    );
    set.status = 201;
    return result;
  })

  // Read the caller's current business.
  .get('/businesses/current', async ({ auth }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    return getBusiness(principal.businessId, container);
  })

  // Update the caller's business — OWNER only.
  .patch('/businesses/current', async ({ body, auth }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    assertRole(principal, 'OWNER');
    const input = parse(updateBusinessSchema, body);
    return updateBusiness(
      {
        actorUserId: principal.userId,
        businessId: principal.businessId,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      },
      container,
    );
  })

  // List staff of the caller's business.
  .get('/staff', async ({ auth }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    return listStaff(principal.businessId, container);
  })

  // Invite / add a staff member — OWNER only.
  .post('/staff', async ({ body, auth, set }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    assertRole(principal, 'OWNER');
    const input = parse(inviteStaffSchema, body);
    const result = await inviteStaff(
      {
        actorUserId: principal.userId,
        businessId: principal.businessId,
        email: input.email,
        fullName: input.fullName,
        role: input.role,
      },
      container,
    );
    set.status = 201;
    return result;
  })

  // Change a staff member's role — OWNER only.
  .patch('/staff/:membershipId/role', async ({ params, body, auth }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    assertRole(principal, 'OWNER');
    const input = parse(changeRoleSchema, body);
    await changeStaffRole(
      {
        actorUserId: principal.userId,
        businessId: principal.businessId,
        membershipId: params.membershipId,
        role: input.role,
      },
      container,
    );
    return { ok: true };
  })

  // Deactivate (soft-remove) a staff member — OWNER only.
  .delete('/staff/:membershipId', async ({ params, auth }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    assertRole(principal, 'OWNER');
    await deactivateStaff(
      {
        actorUserId: principal.userId,
        businessId: principal.businessId,
        membershipId: params.membershipId,
      },
      container,
    );
    return { ok: true };
  });
