import { Elysia } from 'elysia';
import { ValidationError } from '../../../../shared/domain/errors';
import {
  authPlugin,
  assertAuth,
  assertBusiness,
} from '../../../../infrastructure/http/auth-plugin';
import type { AuthContext } from '../../../../infrastructure/http/auth-context';
import { createServicesContainer } from '../../container';
import { createServiceSchema, updateServiceSchema } from './schemas';
import {
  createService,
  listServices,
  updateService,
  deleteService,
} from '../../application/use-cases/manage-services';

const container = createServicesContainer();

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
 * Services router. Controllers only: validate → authenticate → require active
 * business → call use case. `businessId` always comes from `auth`, never the
 * body — so a service can only ever be read/mutated within the caller's tenant.
 */
export const servicesRouter = new Elysia({ prefix: '/api/v1/services' })
  .use(
    authPlugin({ tokens: container.tokens, memberships: container.memberships }),
  )

  .get('/', async ({ auth, query }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    const onlyActive = query?.active === 'true';
    return listServices({ businessId: principal.businessId, onlyActive }, container);
  })

  .post('/', async ({ auth, body, set }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    const input = parse(createServiceSchema, body);
    const result = await createService(
      {
        actorUserId: principal.userId,
        businessId: principal.businessId,
        name: input.name,
        description: input.description ?? null,
        durationMinutes: input.durationMinutes,
        ...(input.priceMinor !== undefined ? { priceMinor: input.priceMinor } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
      },
      container,
    );
    set.status = 201;
    return result;
  })

  .patch('/:serviceId', async ({ auth, params, body }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    const input = parse(updateServiceSchema, body);
    return updateService(
      {
        actorUserId: principal.userId,
        businessId: principal.businessId,
        serviceId: params.serviceId,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.durationMinutes !== undefined
          ? { durationMinutes: input.durationMinutes }
          : {}),
        ...(input.priceMinor !== undefined ? { priceMinor: input.priceMinor } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      container,
    );
  })

  .delete('/:serviceId', async ({ auth, params }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    await deleteService(
      {
        actorUserId: principal.userId,
        businessId: principal.businessId,
        serviceId: params.serviceId,
      },
      container,
    );
    return { ok: true };
  });
