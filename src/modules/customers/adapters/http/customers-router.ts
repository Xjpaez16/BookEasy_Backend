import { Elysia } from 'elysia';
import { ValidationError } from '../../../../shared/domain/errors';
import {
  authPlugin,
  assertAuth,
  assertBusiness,
} from '../../../../infrastructure/http/auth-plugin';
import type { AuthContext } from '../../../../infrastructure/http/auth-context';
import { createCustomersContainer } from '../../container';
import { createCustomerSchema, updateCustomerSchema } from './schemas';
import {
  createCustomer,
  listCustomers,
  updateCustomer,
  deleteCustomer,
} from '../../application/use-cases/manage-customers';

const container = createCustomersContainer();

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
 * Customers router. Controllers only: validate → authenticate → require active
 * business → call use case. `businessId` always comes from `auth`, never the
 * body — tenant isolation is enforced at the data layer too.
 */
export const customersRouter = new Elysia({ prefix: '/api/v1/customers' })
  .use(
    authPlugin({ tokens: container.tokens, memberships: container.memberships }),
  )

  .get('/', async ({ auth, query }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    const search = typeof query?.search === 'string' ? query.search : undefined;
    return listCustomers(
      { businessId: principal.businessId, ...(search ? { search } : {}) },
      container,
    );
  })

  .post('/', async ({ auth, body, set }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    const input = parse(createCustomerSchema, body);
    const result = await createCustomer(
      {
        actorUserId: principal.userId,
        businessId: principal.businessId,
        fullName: input.fullName,
        phone: input.phone ?? null,
        email: input.email ?? null,
        notes: input.notes ?? null,
      },
      container,
    );
    set.status = 201;
    return result;
  })

  .patch('/:customerId', async ({ auth, params, body }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    const input = parse(updateCustomerSchema, body);
    return updateCustomer(
      {
        actorUserId: principal.userId,
        businessId: principal.businessId,
        customerId: params.customerId,
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      container,
    );
  })

  .delete('/:customerId', async ({ auth, params }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    await deleteCustomer(
      {
        actorUserId: principal.userId,
        businessId: principal.businessId,
        customerId: params.customerId,
      },
      container,
    );
    return { ok: true };
  });
