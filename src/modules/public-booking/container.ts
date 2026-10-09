import { db } from '../../infrastructure/db/client';
import { redis } from '../../infrastructure/redis/client';
import { RedisRateLimiter } from '../../infrastructure/redis/rate-limiter';
import { DrizzleUnitOfWork } from '../../infrastructure/db/unit-of-work';
import { HmacTokenService } from '../../infrastructure/security/token-service';
import { SystemClock, UuidGenerator } from '../../infrastructure/security/system-services';
import { DrizzleMembershipRepository } from '../business/adapters/persistence/membership-repository';
import { DrizzleUserRepository } from '../auth/adapters/persistence/user-repository';
import { DrizzleAuditLogRepository } from '../business/adapters/persistence/audit-log-repository';
import { DrizzleAppointmentRepository } from '../appointments/adapters/persistence/appointment-repository';
import { createNotificationsContainer } from '../notifications/container';
import { NotificationsReminderScheduler } from '../appointments/adapters/reminders/notifications-reminder-scheduler';
import { DrizzlePublicBookingReader } from './adapters/persistence/public-booking-reader';

/**
 * Wires the public booking flow. Shares the appointment repository + audit +
 * reminder scheduler with the owner-facing module (one source of truth for the
 * overlap rule and reminders), adds its own slug-resolving reader, and carries
 * the auth deps the router needs to IDENTIFY the user (never to resolve a
 * tenant — the tenant always comes from the slug).
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createPublicBookingContainer() {
  const ids = new UuidGenerator();
  return {
    reader: new DrizzlePublicBookingReader(db, ids),
    appointments: new DrizzleAppointmentRepository(db),
    audit: new DrizzleAuditLogRepository(db),
    clock: new SystemClock(),
    ids,
    uow: new DrizzleUnitOfWork(db),
    reminders: new NotificationsReminderScheduler(createNotificationsContainer()),
    rateLimiter: new RedisRateLimiter(redis),
    // Auth deps: verify the bearer token and resolve the user id only.
    tokens: new HmacTokenService(),
    memberships: new DrizzleMembershipRepository(db),
    // To seed a new customer with the user's own name + email on first booking.
    users: new DrizzleUserRepository(db),
  };
}

export type PublicBookingContainer = ReturnType<typeof createPublicBookingContainer>;
