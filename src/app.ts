import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { cookie } from '@elysiajs/cookie';
import { loadConfig } from './config/env';
import { statusForError, bodyForError } from './infrastructure/http/error-handler';
import { authRouter } from './modules/auth/adapters/http/auth-router';
import { businessRouter } from './modules/business/adapters/http/business-router';
import { servicesRouter } from './modules/services/adapters/http/services-router';
import { customersRouter } from './modules/customers/adapters/http/customers-router';
import { appointmentsRouter } from './modules/appointments/adapters/http/appointments-router';
import { dashboardRouter } from './modules/dashboard/adapters/http/dashboard-router';
import { subscriptionsRouter } from './modules/subscriptions/adapters/http/subscriptions-router';
import { auditLogsRouter } from './modules/audit/adapters/http/audit-logs-router';
import { publicCatalogRouter } from './modules/public-catalog/adapters/http/public-catalog-router';
import { publicBookingRouter } from './modules/public-booking/adapters/http/public-booking-router';

const config = loadConfig();
const isProduction = config.NODE_ENV === 'production';

/**
 * Composition root. Wires cross-cutting middleware and mounts module routers.
 * Business logic lives in the application layer, never here.
 */
// Return type is inferred on purpose: annotating it as `Elysia` conflicts with
// `exactOptionalPropertyTypes` due to Elysia's generic lifecycle hook types.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function buildApp() {
  const app = new Elysia()
    .onError(({ error, set }) => {
      set.status = statusForError(error);
      return bodyForError(error, isProduction);
    })
    // Security headers on every response.
    .onAfterHandle(({ set }) => {
      set.headers['x-content-type-options'] = 'nosniff';
      set.headers['x-frame-options'] = 'DENY';
      set.headers['referrer-policy'] = 'no-referrer';
      set.headers['strict-transport-security'] =
        'max-age=31536000; includeSubDomains';
    })
    .use(
      cors({
        origin: config.CORS_ALLOWED_ORIGINS,
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      }),
    )
    .use(cookie())
    // Liveness / readiness for container orchestration.
    .get('/health', () => ({ status: 'ok' }))
    .get('/ready', () => ({ status: 'ready' }))
    // Public, unauthenticated marketplace storefront (read-only, rate-limited).
    .use(publicCatalogRouter)
    // Public booking: availability (no auth) + book/manage own appointments
    // (user-authenticated, NOT a business member). Tenant resolved by slug.
    .use(publicBookingRouter)
    .use(authRouter)
    .use(businessRouter)
    .use(servicesRouter)
    .use(customersRouter)
    .use(appointmentsRouter)
    .use(dashboardRouter)
    .use(subscriptionsRouter)
    .use(auditLogsRouter);

  return app;
}
