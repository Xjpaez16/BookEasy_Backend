import { db } from '../../infrastructure/db/client';
import { DrizzleUnitOfWork } from '../../infrastructure/db/unit-of-work';
import { HmacTokenService } from '../../infrastructure/security/token-service';
import {
  SystemClock,
  UuidGenerator,
} from '../../infrastructure/security/system-services';
import { DrizzleMembershipRepository } from '../business/adapters/persistence/membership-repository';
import { DrizzleBusinessRepository } from '../business/adapters/persistence/business-repository';
import { DrizzleAuditLogRepository } from '../business/adapters/persistence/audit-log-repository';
import { DrizzleAppointmentRepository } from './adapters/persistence/appointment-repository';
import { DrizzleBusinessHoursRepository } from './adapters/persistence/business-hours-repository';
import {
  DrizzleServiceLookup,
  DrizzleCustomerLookup,
  DrizzleStaffLookup,
} from './adapters/persistence/lookups';
import { createNotificationsContainer } from '../notifications/container';
import { NotificationsReminderScheduler } from './adapters/reminders/notifications-reminder-scheduler';

/** Wires the concrete adapters the appointment use cases depend on. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createAppointmentsContainer() {
  return {
    appointments: new DrizzleAppointmentRepository(db),
    hours: new DrizzleBusinessHoursRepository(db),
    services: new DrizzleServiceLookup(db),
    customers: new DrizzleCustomerLookup(db),
    staff: new DrizzleStaffLookup(db),
    businesses: new DrizzleBusinessRepository(db),
    memberships: new DrizzleMembershipRepository(db),
    audit: new DrizzleAuditLogRepository(db),
    tokens: new HmacTokenService(),
    clock: new SystemClock(),
    ids: new UuidGenerator(),
    uow: new DrizzleUnitOfWork(db),
    reminders: new NotificationsReminderScheduler(createNotificationsContainer()),
  };
}

export type AppointmentsContainer = ReturnType<typeof createAppointmentsContainer>;
