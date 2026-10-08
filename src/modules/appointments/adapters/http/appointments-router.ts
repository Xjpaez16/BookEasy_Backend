import { Elysia } from 'elysia';
import { ValidationError } from '../../../../shared/domain/errors';
import {
  authPlugin,
  assertAuth,
  assertBusiness,
  assertRole,
} from '../../../../infrastructure/http/auth-plugin';
import type { AuthContext } from '../../../../infrastructure/http/auth-context';
import { createAppointmentsContainer } from '../../container';
import {
  createAppointmentSchema,
  rescheduleSchema,
  listQuerySchema,
  setHoursSchema,
} from './schemas';
import { createAppointment } from '../../application/use-cases/create-appointment';
import {
  rescheduleAppointment,
  transitionAppointment,
  listAppointments,
} from '../../application/use-cases/manage-appointments';
import {
  setBusinessHours,
  getBusinessHours,
} from '../../application/use-cases/manage-business-hours';

const container = createAppointmentsContainer();

function parse<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) {
    throw new ValidationError('Invalid request');
  }
  return result.data;
}

/**
 * Appointments router. Controllers only: validate → authenticate → require
 * business → call use case. `businessId` always from `auth`. Business hours
 * config is OWNER-only; calendar + bookings are open to any active member.
 */
export const appointmentsRouter = new Elysia({ prefix: '/api/v1' })
  .use(
    authPlugin({ tokens: container.tokens, memberships: container.memberships }),
  )

  // --- Business hours (configuration) ---
  .get('/business-hours', async ({ auth }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    return getBusinessHours(principal.businessId, container);
  })

  .put('/business-hours', async ({ auth, body }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    assertRole(principal, 'OWNER');
    const input = parse(setHoursSchema, body);
    return setBusinessHours(
      { actorUserId: principal.userId, businessId: principal.businessId, hours: input.hours },
      container,
    );
  })

  // --- Calendar ---
  .get('/appointments', async ({ auth, query }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    const q = parse(listQuerySchema, query ?? {});
    return listAppointments(
      {
        businessId: principal.businessId,
        from: q.from,
        to: q.to,
        ...(q.staffId ? { staffId: q.staffId } : {}),
      },
      container,
    );
  })

  .post('/appointments', async ({ auth, body, set }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    const input = parse(createAppointmentSchema, body);
    const result = await createAppointment(
      {
        actorUserId: principal.userId,
        businessId: principal.businessId,
        customerId: input.customerId,
        serviceId: input.serviceId,
        staffId: input.staffId,
        startAt: input.startAt,
        notes: input.notes ?? null,
      },
      container,
    );
    set.status = 201;
    return result;
  })

  .patch('/appointments/:id/reschedule', async ({ auth, params, body }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    const input = parse(rescheduleSchema, body);
    return rescheduleAppointment(
      {
        actorUserId: principal.userId,
        businessId: principal.businessId,
        appointmentId: params.id,
        startAt: input.startAt,
      },
      container,
    );
  })

  .post('/appointments/:id/cancel', async ({ auth, params }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    return transitionAppointment(
      'cancel',
      { actorUserId: principal.userId, businessId: principal.businessId, appointmentId: params.id },
      container,
    );
  })

  .post('/appointments/:id/complete', async ({ auth, params }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    return transitionAppointment(
      'complete',
      { actorUserId: principal.userId, businessId: principal.businessId, appointmentId: params.id },
      container,
    );
  })

  .post('/appointments/:id/no-show', async ({ auth, params }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    assertBusiness(principal);
    return transitionAppointment(
      'no_show',
      { actorUserId: principal.userId, businessId: principal.businessId, appointmentId: params.id },
      container,
    );
  });
