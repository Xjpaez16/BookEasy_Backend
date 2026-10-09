import { Elysia } from 'elysia';
import { NotFoundError, ValidationError } from '../../../../shared/domain/errors';
import { authPlugin, assertAuth } from '../../../../infrastructure/http/auth-plugin';
import type { AuthContext } from '../../../../infrastructure/http/auth-context';
import { createPublicBookingContainer } from '../../container';
import {
  bookPublicSchema,
  reschedulePublicSchema,
  availabilityQuerySchema,
} from './schemas';
import { getAvailability } from '../../application/use-cases/get-availability';
import { bookPublicAppointment } from '../../application/use-cases/book-public-appointment';
import {
  listMyAppointments,
  cancelMyAppointment,
  rescheduleMyAppointment,
} from '../../application/use-cases/my-appointments';

const container = createPublicBookingContainer();

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

function clientKey(request: Request, suffix: string): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';
  return `public-booking:${suffix}:${ip}`;
}

async function limit(request: Request, suffix: string, max: number): Promise<void> {
  const ok = await container.rateLimiter.consume(clientKey(request, suffix), max, 60);
  if (!ok) throw new ValidationError('Too many requests, slow down');
}

/**
 * Public booking router. The marketplace half of appointments.
 *
 * SECURITY BOUNDARY — this router is for marketplace VISITORS, never business
 * management:
 *  - Availability is unauthenticated (same as browsing the catalog).
 *  - Booking + "my appointments" require a logged-in USER but NOT a business
 *    membership: it calls `assertAuth` only, never `assertBusiness`/`assertRole`.
 *  - The tenant is always resolved from the slug in the path, never from a
 *    client-supplied id. The client never names a staff member.
 *  - "My appointments" and its mutations resolve the caller's OWN customer
 *    record and reject anything that is not theirs (404), so a visitor can
 *    never read or touch another customer's data or any owner-side resource.
 */
export const publicBookingRouter = new Elysia({ prefix: '/api/v1/public' })
  .use(authPlugin({ tokens: container.tokens, memberships: container.memberships }))

  // --- Availability (unauthenticated) ---
  .get('/businesses/:slug/availability', async ({ request, params, query }) => {
    await limit(request, 'availability', 120);
    const q = parse(availabilityQuerySchema, query ?? {});
    return getAvailability(
      { slug: params.slug, serviceId: q.serviceId, date: q.date },
      container,
    );
  })

  // --- Book (authenticated user, NOT a member) ---
  .post('/businesses/:slug/book', async ({ auth, request, params, body, set }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    await limit(request, 'book', 30);

    const input = parse(bookPublicSchema, body);
    const user = await container.users.findById(principal.userId);
    if (!user) throw new NotFoundError('User not found');

    const result = await bookPublicAppointment(
      {
        userId: principal.userId,
        userFullName: user.fullName,
        userEmail: user.email,
        slug: params.slug,
        serviceId: input.serviceId,
        startAt: input.startAt,
        notes: input.notes ?? null,
      },
      container,
    );
    set.status = 201;
    return result;
  })

  // --- My appointments in a business (authenticated user) ---
  .get('/businesses/:slug/my-appointments', async ({ auth, request, params }) => {
    const principal = auth as AuthContext | null;
    assertAuth(principal);
    await limit(request, 'mine', 120);
    return listMyAppointments({ userId: principal.userId, slug: params.slug }, container);
  })

  // --- Cancel my own appointment ---
  .post(
    '/businesses/:slug/appointments/:id/cancel',
    async ({ auth, request, params }) => {
      const principal = auth as AuthContext | null;
      assertAuth(principal);
      await limit(request, 'cancel', 60);
      return cancelMyAppointment(
        { userId: principal.userId, slug: params.slug, appointmentId: params.id },
        container,
      );
    },
  )

  // --- Reschedule my own appointment ---
  .patch(
    '/businesses/:slug/appointments/:id/reschedule',
    async ({ auth, request, params, body }) => {
      const principal = auth as AuthContext | null;
      assertAuth(principal);
      await limit(request, 'reschedule', 60);
      const input = parse(reschedulePublicSchema, body);
      return rescheduleMyAppointment(
        {
          userId: principal.userId,
          slug: params.slug,
          appointmentId: params.id,
          startAt: input.startAt,
        },
        container,
      );
    },
  );
