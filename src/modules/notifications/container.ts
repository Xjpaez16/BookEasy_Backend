import { db } from '../../infrastructure/db/client';
import { redis } from '../../infrastructure/redis/client';
import { SystemClock, UuidGenerator } from '../../infrastructure/security/system-services';
import { loadConfig } from '../../config/env';
import { DrizzleNotificationRepository } from './adapters/persistence/notification-repository';
import { DrizzleReminderContextLookup } from './adapters/persistence/reminder-context-lookup';
import { RedisReminderQueue } from './adapters/queue/redis-reminder-queue';
import {
  WhatsAppCloudSender,
  ConsoleReminderEmailSender,
} from './adapters/channels/senders';

/** Wires the concrete adapters the reminder use cases + worker depend on. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createNotificationsContainer() {
  const config = loadConfig();
  return {
    notifications: new DrizzleNotificationRepository(db),
    queue: new RedisReminderQueue(redis),
    whatsapp: new WhatsAppCloudSender(config),
    email: new ConsoleReminderEmailSender(config.NODE_ENV === 'production'),
    context: new DrizzleReminderContextLookup(db),
    ids: new UuidGenerator(),
    clock: new SystemClock(),
    config,
  };
}

export type NotificationsContainer = ReturnType<typeof createNotificationsContainer>;
